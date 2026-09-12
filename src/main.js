import { createServer } from 'node:http';
import { createServer as https } from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { sandbox } from './server.js';
import { sender } from './wire.js';
const dir = process.env.SANDBOX_CERTS ?? '.vehicle-sandbox/certs';
const certs = existsSync(`${dir}/server.crt`);
const receiver = process.env.SANDBOX_RECEIVER_URL;
const host = process.env.SANDBOX_BIND ?? '127.0.0.1';
const app = sandbox({
  audience: process.env.SANDBOX_AUDIENCE,
  redirectUri: process.env.SANDBOX_REDIRECT_URI,
  receiverCa: certs ? readFileSync(`${dir}/ca.crt`, 'utf8') : undefined,
  destination: { hostname: process.env.SANDBOX_RECEIVER_HOST ?? 'receiver', port: Number(process.env.SANDBOX_RECEIVER_PORT ?? 4443) },
  send: receiver ? sender({ url: receiver, caFile: `${dir}/ca.crt`, certFile: `${dir}/vehicle.crt`, keyFile: `${dir}/vehicle.key` }) : undefined,
});
const servers = [createServer(app.api), createServer(app.control)];
servers[0].listen(8090, host);
servers[1].listen(8099, host);
if (certs) { const secure = https({ key: readFileSync(`${dir}/server.key`), cert: readFileSync(`${dir}/server.crt`) }, app.api); secure.listen(8444, host); servers.push(secure); }
console.log(`Vehicle Sandbox: API ${host}:8090, control ${host}:8099; telemetry ${receiver ? 'enabled' : 'capture only'}`);
for (const server of servers) server.on('error', error => { console.error(error.message); process.exit(1); });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { for (const server of servers) server.close(); });
