import { app, BrowserWindow, Menu, Notification, Tray, clipboard, ipcMain, nativeImage, screen, session, shell } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './src/store.js';
import { createLogger } from './src/logs.js';
import { buildSupportInfo } from './src/support.js';
import { createEngineClient } from './src/engine-client.js';
import { isAllowedLink } from './src/links.js';
import { loadBounds, saveBounds, fitBounds } from './src/window-state.js';
import { tMain } from './src/i18n-main.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const logger = createLogger({ dir: path.join(app.getPath('userData'), 'logs'), prefix: 'audio-monitor-router' });
logger.prune();
process.on('uncaughtExceptionMonitor', (err) => logger.log('error', `uncaught: ${err?.message || err}`, 'main'));

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showWindow());

let win = null;
let tray = null;
let quitting = false;
let engine = null;
let restarts = [];
const startHidden = process.argv.includes('--hidden');       // set by the start-at-login entry

const store = createStore(path.join(app.getPath('userData'), 'settings.json'));
const send = (channel, data) => { if (win && !win.isDestroyed()) win.webContents.send(channel, data); };

// ---- the audio engine: a separate process (see docs/PROTOCOL.md) ----
function engineCommand() {
  const bundled = path.join(process.resourcesPath || '', 'engine', process.platform === 'win32' ? 'amr-engine.exe' : 'amr-engine');
  if (app.isPackaged && fs.existsSync(bundled)) return { command: bundled, args: [], cwd: path.dirname(bundled) };
  return { command: process.platform === 'win32' ? 'python' : 'python3', args: ['-m', 'amr_engine'], cwd: path.join(__dirname, 'engine') };
}

function startEngine() {
  const c = engineCommand();
  engine = createEngineClient({
    ...c,
    onLog: (level, msg) => logger.log(level, msg, 'engine'),
    onEvent: (ev) => {
      if (ev.event === 'route_warning') logger.log('warn', `buffer: ${ev.underruns} underruns, ${ev.overruns} overruns`, 'route');
      if (ev.event === 'route_stopped' && ev.reason === 'device_gone') logger.log('warn', 'a device was disconnected', 'route');
      if (ev.event === 'engine_down') {
        logger.log('error', `engine down: ${ev.reason} ${ev.detail || ''}`, 'engine');
        // a crashed engine is restarted, at most 5 times a minute
        const now = Date.now();
        restarts = restarts.filter((t) => now - t < 60_000);
        if (ev.reason === 'exit' && restarts.length < 5) {
          restarts.push(now);
          send('engine:event', ev);
          setTimeout(startEngine, 1000);
          return;
        }
        if (ev.reason === 'exit') ev = { ...ev, reason: 'failed' };   // gave up: the page shows the cause, not "restarting"
      }
      send('engine:event', ev);
    },
  });
  engine.start();
}

// ---- window ----
const boundsFile = path.join(app.getPath('userData'), 'window.json');

function createWindow({ show = true } = {}) {
  const saved = fitBounds(loadBounds(boundsFile), screen.getAllDisplays().map((d) => d.workArea));
  win = new BrowserWindow({
    width: 1100, height: 640, ...(saved || {}), minWidth: 620, minHeight: 420, title: 'Audio Monitor Router', backgroundColor: '#17191d', show,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  let timer;
  const remember = () => { clearTimeout(timer); timer = setTimeout(() => { if (win && !win.isDestroyed() && !win.isMinimized() && !win.isMaximized()) saveBounds(boundsFile, win.getBounds()); }, 500); };
  win.on('resize', remember);
  win.on('move', remember);

  // closing the window keeps the app (and the listening) running in the notification area, unless the user chose otherwise
  win.on('close', (e) => {
    if (quitting || !store.get().closeToTray || !tray) return;
    e.preventDefault();
    win.hide();
    if (!store.get().trayNoticeShown) {
      store.update({ trayNoticeShown: true });
      const lang = store.get().language;
      if (Notification.isSupported()) new Notification({ title: tMain(lang, 'tray.noticeTitle'), body: tMain(lang, 'tray.noticeBody') }).show();
    }
  });
  win.on('closed', () => { win = null; });
}

function showWindow() {
  if (!win) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function buildTray() {
  const lang = store.get().language;
  if (!tray) {
    const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.on('click', showWindow);
  }
  tray.setToolTip(tMain(lang, 'tray.tooltip'));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: tMain(lang, 'tray.open'), click: showWindow },
    { type: 'separator' },
    { label: tMain(lang, 'tray.quit'), click: () => { quitting = true; app.quit(); } },
  ]));
}

// start at login: off until the user switches it on; it starts hidden, in the notification area
function applyLoginItem() {
  if (!app.isPackaged || process.platform === 'linux') return;
  try { app.setLoginItemSettings({ openAtLogin: store.get().startAtLogin, args: ['--hidden'] }); } catch { /* not allowed on this system */ }
}

// ---- messages from the page ----
ipcMain.handle('settings:get', () => store.get());
ipcMain.handle('settings:update', (_e, patch) => {
  const before = store.get();
  const next = store.update(patch && typeof patch === 'object' ? patch : {});
  if (next.startAtLogin !== before.startAtLogin) applyLoginItem();
  if (next.language !== before.language && tray) buildTray();
  return next;
});
ipcMain.on('engine:send', (_e, cmd) => { if (engine) engine.send(cmd); });
ipcMain.handle('links:open', (_e, url) => {
  if (!isAllowedLink(url)) return false;
  shell.openExternal(url);
  return true;
});
ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text).slice(0, 4000)); return true; });
ipcMain.handle('app:info', () => ({ version: app.getVersion(), system: `${process.platform} ${process.arch}` }));
ipcMain.handle('app:support-info', () => buildSupportInfo({
  app: 'Audio Monitor Router', version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome,
  platform: process.platform, arch: process.arch, osRelease: os.release(), language: store.get().language,
  lastCheck: null, lastError: logger.entries().filter((e) => e.level === 'error').pop() || null, home: os.homedir(),
}));
ipcMain.handle('logs:open', () => shell.openPath(path.join(app.getPath('userData'), 'logs')));

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  startEngine();
  buildTray();
  createWindow({ show: !startHidden });
  applyLoginItem();
  app.on('activate', showWindow);
});

app.on('before-quit', () => { quitting = true; if (engine) engine.stop(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') { quitting = true; app.quit(); } });   // only reached when closing is allowed to quit
