import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { connect } from 'node:net';
if (!existsSync('.vehicle-sandbox/certs/ca.key')) execFileSync(process.execPath, ['scripts/certs.js'], { stdio:'inherit' });
execFileSync('docker', ['compose', 'up', '-d'], { stdio:'inherit' });
// Wait for the published receiver socket before accepting scenario controls.
for (let attempt = 0; ; attempt++) {
  const ready = await new Promise(resolve => {
    const socket = connect({ host:'127.0.0.1', port:4443 });
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
  if (ready) break;
  if (attempt >= 29) throw new Error('Receiver did not start; inspect docker compose logs receiver');
  await setTimeout(500);
}
process.env.SANDBOX_RECEIVER_URL ??= 'wss://localhost:4443/';
if (process.argv.includes('--odomojo')) process.env.SANDBOX_AUDIENCE ??= 'http://host.docker.internal:8090';
await import('../src/main.js');
