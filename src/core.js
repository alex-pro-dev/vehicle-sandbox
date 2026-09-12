export const VIN = 'SANDB0X0000000001';
export const FIELDS = ['Location', 'VehicleSpeed', 'Soc', 'Odometer'];
export const MILES_TO_KM = 1.609344;
export function requireValue(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
export function integer(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

// Physical state uses SI-derived units. Tesla adapter values use miles and mph.
// A fixed-speed eastbound route on the equator is intentionally synthetic.
export class Garage {
  constructor() { this.reset(); }
  reset(epoch = '2026-01-01T00:00:00.000Z') {
    requireValue(typeof epoch === 'string' && Number.isFinite(Date.parse(epoch)), 'Invalid epoch');
    this.now = Math.floor(Date.parse(epoch) / 1000) * 1000;
    this.vehicle = { vin: VIN, id: 1, id_s: '1', display_name: 'Sandbox Tesla', state: 'online' };
    this.physical = { latitude: 0, longitude: 0, speedKmh: 0, odometerKm: 10000, soc: 80 };
    this.paired = false;
    this.granted = false;
    this.config = null;
    this.lastSample = {};
    this.records = [];
    this.faults = { missing: [], invalid: [], delaySeconds: 0, copies: 1, disconnected: false };
  }
  setFaults(input) {
    requireValue(input && typeof input === 'object' && !Array.isArray(input), 'Expected fault object');
    requireValue(Object.keys(input).every(k => Object.hasOwn(this.faults, k)), 'Unknown fault');
    const f = { ...this.faults, ...input };
    for (const k of ['missing', 'invalid']) requireValue(Array.isArray(f[k]) && f[k].every(v => FIELDS.includes(v)), 'Unknown field');
    requireValue(integer(f.delaySeconds, 0, 86400) && integer(f.copies, 1, 3) && typeof f.disconnected === 'boolean', 'Invalid delivery fault');
    this.faults = structuredClone(f);
  }
  configure(config) {
    requireValue(config && typeof config === 'object', 'Expected config');
    requireValue(typeof config.hostname === 'string' && integer(config.port, 1, 65535) && typeof config.ca === 'string', 'Invalid destination');
    requireValue(integer(config.exp, 1, 4102444800) && config.exp * 1000 > this.now, 'Configuration expired');
    requireValue(config.fields && Object.keys(config.fields).length > 0 && Object.keys(config.fields).every(k => FIELDS.includes(k)), 'Unsupported fields');
    for (const settings of Object.values(config.fields)) requireValue(settings && integer(settings.interval_seconds, 1, 3600), 'Invalid interval');
    this.config = structuredClone(config);
    this.lastSample = {};
  }
  advance(seconds) {
    requireValue(integer(seconds, 0, 3600), 'seconds must be an integer from 0 to 3600');
    // Bound retained test history; reset between scenarios.
    requireValue(this.records.length + seconds <= 20000, 'Scenario history limit reached; reset first', 409);
    for (let n = 0; n < seconds; n++) {
      this.now += 1000;
      const requested = this.physical.speedKmh / 3600;
      const distance = Math.min(requested, this.physical.soc / 100 * 60 / 0.18);
      this.physical.odometerKm += distance;
      this.physical.longitude = ((this.physical.longitude + distance / 111.195 + 180) % 360) - 180;
      this.physical.soc = Math.max(0, this.physical.soc - distance * 0.18 / 60 * 100);
      if (this.physical.soc === 0) this.physical.speedKmh = 0;
      if (!this.config || !this.granted || !this.paired || this.config.exp * 1000 <= this.now) continue;
      const data = [];
      for (const [key, settings] of Object.entries(this.config.fields)) {
        if (this.lastSample[key] !== undefined && this.now - this.lastSample[key] < settings.interval_seconds * 1000) continue;
        this.lastSample[key] = this.now;
        if (this.faults.missing.includes(key)) continue;
        const values = {
          Location: { locationValue: { latitude: this.physical.latitude, longitude: this.physical.longitude } },
          VehicleSpeed: { doubleValue: this.physical.speedKmh / MILES_TO_KM },
          Soc: { doubleValue: this.physical.soc },
          Odometer: { doubleValue: this.physical.odometerKm / MILES_TO_KM },
        };
        data.push({ key, value: this.faults.invalid.includes(key) ? { invalid: true } : values[key] });
      }
      if (data.length) this.records.push({
        id: this.records.length, payload: { vin: VIN, createdAt: new Date(this.now).toISOString(), data },
        due: this.now + this.faults.delaySeconds * 1000, copies: this.faults.copies, delivered: 0,
      });
    }
    return this.snapshot();
  }
  snapshot() {
    return structuredClone({ now: new Date(this.now).toISOString(), vehicle: this.vehicle, physical: this.physical,
      paired: this.paired, granted: this.granted, configured: !!this.config && this.config.exp * 1000 > this.now,
      faults: this.faults, records: this.records });
  }
}
