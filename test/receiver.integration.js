import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from 'redis';
import { Garage, VIN } from '../src/core.js';
import { sender } from '../src/wire.js';
import { config } from './helpers.js';
const dir = '.vehicle-sandbox/certs';
const send = sender({ url:'wss://localhost:4443/', caFile:`${dir}/ca.crt`, certFile:`${dir}/vehicle.crt`, keyFile:`${dir}/vehicle.key` });
test('official v0.9.4 receiver authenticates, decodes and publishes four signals, including resends', { timeout:15000 }, async t => {
  const redis = createClient({ url:'redis://127.0.0.1:6399' });
  redis.on('error', () => {}); await redis.connect(); t.after(() => redis.destroy());
  const records = [];
  await redis.subscribe(`odomojo_V_{${VIN}}`, data => records.push(JSON.parse(data)));
  const g = new Garage(); g.granted = true; g.paired = true; g.configure(config(g.snapshot().now)); g.advance(1);
  const p = g.records[0].payload;
  await send(p); await send({ ...p, isResend:true });
  // Reliable ACK confirms Redis publish; allow the local subscriber to process.
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(records.length, 2);
  assert.equal(records[0].vin, VIN);
  assert.deepEqual(records[0].data, p.data);
  assert.equal(Date.parse(records[0].createdAt), Date.parse(p.createdAt));
  assert.equal(records[1].isResend, true);
  // Receiver derives identity from the certificate, overriding a spoofed payload VIN.
  await send({ ...p, vin:'SANDB0X0000000002' });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(records[2].vin, VIN);
});
test('wire delivery rejects incorrect server trust and a certificate without client-auth usage', { timeout:15000 }, async () => {
  const g = new Garage(); g.granted = true; g.paired = true; g.configure(config(g.snapshot().now)); g.advance(1);
  const wrongTrust = sender({ url:'wss://localhost:4443/', caFile:`${dir}/vehicle.crt`, certFile:`${dir}/vehicle.crt`, keyFile:`${dir}/vehicle.key` });
  await assert.rejects(wrongTrust(g.records[0].payload));
  const wrongUsage = sender({ url:'wss://localhost:4443/', caFile:`${dir}/ca.crt`, certFile:`${dir}/server.crt`, keyFile:`${dir}/server.key` });
  await assert.rejects(wrongUsage(g.records[0].payload));
});
