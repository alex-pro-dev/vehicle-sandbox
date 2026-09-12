import { readFileSync } from 'node:fs';
import { Builder, ByteBuffer } from 'flatbuffers';
import protobuf from 'protobufjs';
import WebSocket from 'ws';

const root = protobuf.loadSync(new URL('../vendor/tesla/vehicle_data.proto', import.meta.url).pathname);
const Payload = root.lookupType('telemetry.vehicle_data.Payload');

// Tesla v0.9.4 FlatbuffersStream/Envelope field slots. See docs/COMPATIBILITY.md.
export function encode(payload, txid) {
  const milliseconds = Date.parse(payload.createdAt);
  const message = Payload.fromObject({ ...payload, createdAt: {
    seconds: Math.floor(milliseconds / 1000), nanos: (milliseconds % 1000) * 1e6,
  } });
  const b = new Builder(1024);
  const sender = b.createString(`vehicle_device.${payload.vin}`);
  const bytes = b.createByteVector(Payload.encode(message).finish());
  const deviceType = b.createString('vehicle_device');
  const vin = b.createString(payload.vin);
  b.startObject(6);
  b.addFieldInt32(0, Math.floor(milliseconds / 1000), 0);
  b.addFieldOffset(1, sender, 0);
  b.addFieldOffset(2, bytes, 0);
  b.addFieldOffset(3, deviceType, 0);
  b.addFieldOffset(4, vin, 0);
  const stream = b.endObject();
  const transaction = b.createString(txid);
  const topic = b.createString('V');
  const messageId = b.createString(txid);
  b.startObject(5);
  b.addFieldOffset(0, transaction, 0);
  b.addFieldOffset(1, topic, 0);
  b.addFieldInt8(2, 4, 0);
  b.addFieldOffset(3, stream, 0);
  b.addFieldOffset(4, messageId, 0);
  b.finish(b.endObject());
  return b.asUint8Array();
}
function acknowledged(data, txid) {
  try {
    const b = new ByteBuffer(new Uint8Array(data));
    const table = b.readInt32(0);
    const type = b.__offset(table, 8);
    const id = b.__offset(table, 4);
    const topic = b.__offset(table, 6);
    return type && id && topic && b.readInt8(table + type) === 5 && b.__string(table + id) === txid && b.__string(table + topic) === 'V';
  } catch { return false; }
}
export function sender({ url, caFile, certFile, keyFile }) {
  const tls = { ca: readFileSync(caFile), cert: readFileSync(certFile), key: readFileSync(keyFile) };
  let sequence = 0;
  return async payload => {
    const txid = `sandbox-${++sequence}`;
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { ...tls, handshakeTimeout: 5000, headers: { Version: 'vehicle-sandbox/0.1', 'X-Network-Interface': 'wifi' } });
      let settled = false;
      const done = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.terminate();
        if (error) reject(error); else resolve();
      };
      const timer = setTimeout(() => done(new Error('Receiver ACK timed out')), 5000);
      socket.on('error', error => done(error));
      socket.on('close', () => done(new Error('Receiver closed before ACK')));
      socket.on('open', () => socket.send(encode(payload, txid)));
      socket.on('message', data => { if (acknowledged(data, txid)) done(); });
    });
  };
}
