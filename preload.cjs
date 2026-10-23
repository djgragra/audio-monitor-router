const { contextBridge, ipcRenderer } = require('electron');

// The only door between the page and the main process: explicit, named channels.
contextBridge.exposeInMainWorld('api', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
  },
  engine: {
    send: (cmd) => ipcRenderer.send('engine:send', cmd),
    onEvent: (cb) => ipcRenderer.on('engine:event', (_e, ev) => cb(ev)),
  },
  links: { open: (url) => ipcRenderer.invoke('links:open', url) },
  clipboard: { write: (text) => ipcRenderer.invoke('clipboard:write', text) },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    supportInfo: () => ipcRenderer.invoke('app:support-info'),
    openLogs: () => ipcRenderer.invoke('logs:open'),
  },
});
