import test from 'node:test';
import assert from 'node:assert/strict';
import { Garage, MILES_TO_KM, VIN } from '../src/core.js';
import { config } from './helpers.js';
function configured() { const g = new Garage(); g.granted = true; g.paired = true; g.configure(config(g.snapshot().now)); return g; }
test('reset reproduces drive, field intervals, source times and coherent units', () => {
  assert.match(VIN, /^[A-HJ-NPR-Z0-9]{17}$/);
  const run = () => { const g = configured(); g.physical.speedKmh = 36; return g.advance(61); };
  const a = run(); assert.deepEqual(a, run());
  assert.equal(a.records.length, 3);
  assert.equal(a.records[1].payload.data.length, 2);
  assert.equal(a.records[2].payload.data.length, 4);
  assert.ok(Math.abs(a.physical.odometerKm - 10000.61) < 1e-8);
  assert.ok(a.physical.longitude > 0 && a.physical.soc < 80);
  const speed = a.records[2].payload.data.find(d => d.key === 'VehicleSpeed');
  assert.ok(Math.abs(speed.value.doubleValue * MILES_TO_KM - 36) < 1e-8);
  assert.equal(a.records[0].payload.createdAt, '2026-01-01T00:00:01.000Z');
});
test('discovery, pairing alone, revoked grants and expired configuration produce no telemetry', () => {
  const g = new Garage(); g.advance(30); assert.equal(g.records.length, 0);
  g.paired = true; g.granted = true; g.advance(30); assert.equal(g.records.length, 0);
  const c = config(g.snapshot().now); c.exp = g.now / 1000 + 2; g.configure(c);
  g.advance(100); assert.equal(g.records.length, 1);
  g.configure(config(g.snapshot().now)); g.granted = false; g.advance(30); assert.equal(g.records.length, 1);
});
test('missing/invalid fields and delayed duplicate delivery keep observation times', () => {
  const g = configured(); g.setFaults({ missing: ['Soc'], invalid: ['Location'], delaySeconds: 90, copies: 2 });
  g.advance(1); const r = g.records[0];
  assert.equal(r.due - Date.parse(r.payload.createdAt), 90000);
  assert.equal(r.copies, 2); assert.equal(r.payload.data.length, 3);
  assert.deepEqual(r.payload.data[0], { key: 'Location', value: { invalid: true } });
  const before = g.snapshot();
  assert.throws(() => g.setFaults({ delaySeconds: -1 }));
  assert.deepEqual(g.snapshot(), before);
  assert.throws(() => g.advance(1.5)); assert.throws(() => g.configure({ ...g.config, fields: { Invented: { interval_seconds: 1 } } }));
});
