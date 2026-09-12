import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { Garage, VIN, requireValue, integer } from './core.js';

const opaque = () => randomBytes(24).toString('base64url');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const json = (res, value, status = 200) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
async function body(req) {
  let text = '';
  for await (const chunk of req) { text += chunk; requireValue(text.length <= 65536, 'Body too large', 413); }
  if (!text) return {};
  if (req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(text));
  requireValue(req.headers['content-type']?.startsWith('application/json'), 'Expected JSON or form content type', 415);
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
  if (req.method === 'DELETE' && Array.isArray(parsed) && parsed.length === 0) return {};
  requireValue(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'Expected JSON object');
  return parsed;
}
export function sandbox(options = {}) {
  const garage = new Garage();
  const clientId = options.clientId ?? 'sandbox-client';
  const secret = options.clientSecret ?? 'sandbox-secret';
  const redirectUri = options.redirectUri ?? 'http://localhost:8091/api/v1/oauth/tesla/callback';
  const audience = options.audience ?? 'http://localhost:8090';
  const destination = options.destination ?? { hostname: 'receiver', port: 4443 };
  const codes = new Map(), tokens = new Map(), refresh = new Map();
  let consent = new Map();
  const issue = () => {
    const access_token = opaque(), refresh_token = opaque();
    tokens.set(access_token, garage.now + 3600000);
    refresh.set(refresh_token, garage.now + 90 * 86400000);
    return { access_token, refresh_token, expires_in: 3600, token_type: 'Bearer' };
  };
  const authenticated = req => requireValue(garage.granted && (tokens.get(req.headers.authorization?.replace(/^Bearer /, '')) ?? 0) > garage.now, 'invalid_token', 401);
  async function flush() {
    if (!options.send || garage.faults.disconnected) return;
    for (const record of garage.records) {
      if (record.due > garage.now) continue;
      while (record.delivered < record.copies) {
        await options.send({ ...record.payload, isResend: record.delivered > 0 });
        record.delivered++;
      }
    }
  }
  const oauthRequest = q => {
    requireValue(q.client_id === clientId && q.redirect_uri === redirectUri && q.response_type === 'code' && typeof q.state === 'string' && q.state.length > 0, 'invalid_request');
    const scopes = q.scope?.split(' ') ?? [];
    requireValue(['openid', 'offline_access', 'vehicle_device_data', 'vehicle_location'].every(s => scopes.includes(s)) && scopes.every(s => ['openid', 'offline_access', 'vehicle_device_data', 'vehicle_location'].includes(s)), 'invalid_scope');
  };
  const redirect = (res, params) => {
    const target = new URL(redirectUri);
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
    res.writeHead(302, { location: target.href, 'cache-control': 'no-store' }); res.end();
  };
  async function api(req, res, url, input) {
    if (url.pathname === '/health' && req.method === 'GET') return json(res, { status: 'ok', simulator: true });
    if (url.pathname === '/oauth2/v3/authorize') {
      if (req.method === 'GET') {
        const q = Object.fromEntries(url.searchParams); oauthRequest(q);
        requireValue(consent.size < 1000, 'Too many pending authorizations', 429);
        const ticket = opaque(); consent.set(ticket, { ...q, exp: garage.now + 600000 });
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'" });
        return res.end(`<!doctype html><title>Vehicle Sandbox consent</title><h1>Connect a synthetic Tesla</h1><p>Local developer simulation. No Tesla account or password is needed.</p><form method="post"><input type="hidden" name="ticket" value="${escape(ticket)}"><button name="decision" value="allow">Allow test access</button><button name="decision" value="deny">Cancel</button></form>`);
      }
      if (req.method === 'POST') {
        const q = consent.get(input.ticket);
        requireValue(q && q.exp > garage.now && ['allow', 'deny'].includes(input.decision), 'invalid_request');
        consent.delete(input.ticket);
        if (input.decision === 'deny') return redirect(res, { state: q.state, error: 'access_denied' });
        garage.granted = true;
        const code = opaque(); codes.set(code, { redirect: q.redirect_uri, exp: garage.now + 600000 });
        return redirect(res, { state: q.state, code });
      }
    }
    if (url.pathname === '/oauth2/v3/token' && req.method === 'POST') {
      requireValue(input.client_id === clientId, 'invalid_client', 401);
      if (input.grant_type === 'authorization_code') {
        requireValue(input.client_secret === secret, 'invalid_client', 401);
        const code = codes.get(input.code);
        requireValue(garage.granted && code && code.exp > garage.now && code.redirect === input.redirect_uri && input.audience === audience, 'invalid_grant');
        codes.delete(input.code);
      } else {
        requireValue(input.grant_type === 'refresh_token', 'unsupported_grant_type');
        requireValue(garage.granted && (refresh.get(input.refresh_token) ?? 0) > garage.now, 'invalid_grant');
        refresh.delete(input.refresh_token);
      }
      return json(res, issue());
    }
    authenticated(req);
    if (url.pathname === '/api/1/vehicles' && req.method === 'GET') return json(res, { response: url.searchParams.has('page') && url.searchParams.get('page') !== '1' ? [] : [garage.vehicle], count: 1 });
    if (url.pathname === '/api/1/vehicles/fleet_status' && req.method === 'POST') {
      requireValue(Array.isArray(input.vins) && input.vins.length === 1 && input.vins[0] === VIN, 'Unknown VIN', 404);
      return json(res, { response: { key_paired_vins: garage.paired ? [VIN] : [], unpaired_vins: garage.paired ? [] : [VIN], vehicle_info: { [VIN]: { firmware_version: '2026.26.6', fleet_telemetry_version: '0.9.4' } } } });
    }
    if (url.pathname === '/api/1/vehicles/fleet_telemetry_config' && req.method === 'POST') {
      requireValue(Array.isArray(input.vins) && input.vins.length === 1 && input.vins[0] === VIN, 'Unknown VIN', 404);
      if (!garage.paired) return json(res, { response: { updated_vehicles: 0, skipped_vehicles: { missing_key: [VIN] } } });
      requireValue(input.config?.hostname === destination.hostname && input.config?.port === destination.port, 'Receiver destination must match sandbox configuration');
      if (options.receiverCa) requireValue(input.config.ca === options.receiverCa, 'Receiver CA mismatch');
      garage.configure(input.config);
      return json(res, { response: { updated_vehicles: 1, skipped_vehicles: {} } });
    }
    if (url.pathname === `/api/1/vehicles/${VIN}/fleet_telemetry_config` && req.method === 'DELETE') {
      garage.config = null;
      return json(res, { response: true });
    }
    json(res, { error: 'unsupported_endpoint' }, 404);
  }
  async function control(req, res, url, input) {
    // A separate, loopback-bound listener. Reject browser cross-origin requests.
    requireValue(!req.headers.origin, 'Control API does not accept browser origins', 403);
    if (req.method === 'GET' && url.pathname === '/control/state') return json(res, garage.snapshot());
    requireValue(req.method === 'POST', 'Method not allowed', 405);
    switch (url.pathname) {
      case '/control/reset':
        garage.reset(input.epoch); codes.clear(); tokens.clear(); refresh.clear(); consent = new Map(); break;
      case '/control/pair': requireValue(typeof input.paired === 'boolean', 'paired must be boolean'); garage.paired = input.paired; break;
      case '/control/drive': requireValue(typeof input.speedKmh === 'number' && Number.isFinite(input.speedKmh) && input.speedKmh >= 0 && input.speedKmh <= 200, 'Invalid speed'); garage.physical.speedKmh = input.speedKmh; break;
      case '/control/faults': garage.setFaults(input); break;
      case '/control/advance': garage.advance(input.seconds); await flush(); break;
      case '/control/revoke': garage.granted = false; garage.config = null; codes.clear(); tokens.clear(); refresh.clear(); break;
      case '/control/replay': {
        requireValue(integer(input.id, 0, garage.records.length - 1), 'Unknown record');
        requireValue(!!options.send, 'Wire sender not configured', 409);
        await options.send({ ...garage.records[input.id].payload, isResend: true }); break;
      }
      default: return json(res, { error: 'unknown_control' }, 404);
    }
    json(res, garage.snapshot());
  }
  // Serialize state-changing requests, including async transport ACK waits.
  let tail = Promise.resolve();
  function handler(fn) {
    return (req, res) => {
      const parsed = body(req); parsed.catch(() => {});
      tail = tail.then(async () => {
        try { await fn(req, res, new URL(req.url, 'http://sandbox'), await parsed); }
        catch (error) { json(res, { error: error.status ? error.message : 'delivery_or_internal_error' }, error.status ?? 502); }
      }).catch(() => {});
    };
  }
  return { garage, api: handler(api), control: handler(control), createServers: () => [createServer(handler(api)), createServer(handler(control))] };
}
