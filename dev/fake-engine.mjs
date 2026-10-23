// A stand-in for the audio engine, to test the client without sound or Python.
import readline from 'node:readline';
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
out({ event: 'ready', protocol: 1 });
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  if (m.cmd === 'quit') process.exit(0);
  if (m.cmd === 'list_devices') out({ event: 'devices', sources: [], destinations: [] });
  if (m.cmd === 'start_route') { process.stdout.write('not json\n'); out({ event: 'route_started', route_id: m.route_id }); }
  if (m.cmd === 'crash') process.exit(3);
});
