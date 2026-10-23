// Talks to the audio engine process: one JSON object per line on stdin (commands) and stdout (events).
import { spawn as nodeSpawn } from 'node:child_process';

export const COMMANDS = new Set(['list_devices', 'start_route', 'stop_route', 'set_gain', 'set_channels', 'set_latency', 'monitor_sources']);

export function createEngineClient({ command, args = [], cwd, spawn = nodeSpawn, onEvent, onLog = () => {} }) {
  let child = null;
  let buf = '';
  let stopping = false;
  let lastErr = '';

  function start() {
    stopping = false;
    buf = '';
    try {
      child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      onEvent({ event: 'engine_down', reason: 'spawn', detail: e.message });
      return;
    }
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          onEvent(JSON.parse(line));
        } catch {
          onLog('warn', 'engine sent a line that is not JSON');
        }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (t) => {
      const lines = t.trim().split('\n');
      lastErr = lines[lines.length - 1].trim().slice(0, 200);
      onLog('warn', `engine: ${t.trim().slice(0, 300)}`);
    });
    child.on('error', (e) => {
      child = null;
      onEvent({ event: 'engine_down', reason: e.code === 'ENOENT' ? 'missing' : 'spawn', detail: e.message });
    });
    child.on('exit', (code) => {
      child = null;
      if (!stopping) onEvent({ event: 'engine_down', reason: 'exit', detail: lastErr || `code ${code}` });
    });
  }

  return {
    start,
    send(cmd) {
      if (!child || !COMMANDS.has(cmd?.cmd)) return false;
      child.stdin.write(JSON.stringify(cmd) + '\n');
      return true;
    },
    stop() {
      stopping = true;
      if (child) {
        try {
          child.stdin.write('{"cmd":"quit"}\n');
          child.stdin.end();
        } catch { /* already closed */ }
        const c = child;
        setTimeout(() => c.kill(), 1500).unref();
      }
    },
    get running() { return child !== null; },
  };
}
