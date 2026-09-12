import { readFileSync, existsSync } from 'node:fs';
const api = process.env.SANDBOX_API ?? 'http://localhost:8090';
const control = 'http://localhost:8099';
async function call(base, path, data, token) {
  const response = await fetch(base + path, { method:'POST', headers:{'content-type':'application/json', ...(token ? { authorization:`Bearer ${token}` } : {})}, body:JSON.stringify(data ?? {}), redirect:'manual' });
  if (!response.ok && response.status !== 302) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response;
}
await call(control, '/control/reset');
const query = new URLSearchParams({ client_id:'sandbox-client', redirect_uri:'http://localhost:8091/api/v1/oauth/tesla/callback', response_type:'code', scope:'openid offline_access vehicle_device_data vehicle_location', state:'local-demo' });
const html = await (await fetch(`${api}/oauth2/v3/authorize?${query}`)).text();
const ticket = html.match(/name="ticket" value="([^"]+)"/)[1];
const approved = await call(api, '/oauth2/v3/authorize', { ticket, decision:'allow' });
const code = new URL(approved.headers.get('location')).searchParams.get('code');
const tokens = await (await call(api, '/oauth2/v3/token', { client_id:'sandbox-client', client_secret:'sandbox-secret', grant_type:'authorization_code', code, redirect_uri:'http://localhost:8091/api/v1/oauth/tesla/callback', audience:process.env.SANDBOX_AUDIENCE ?? 'http://localhost:8090' })).json();
const discovered = await (await fetch(`${api}/api/1/vehicles`, { headers:{ authorization:`Bearer ${tokens.access_token}` } })).json();
await call(control, '/control/pair', { paired:true });
const ca = existsSync('.vehicle-sandbox/certs/ca.crt') ? readFileSync('.vehicle-sandbox/certs/ca.crt','utf8') : 'capture-only';
await call(api, '/api/1/vehicles/fleet_telemetry_config', { vins:[discovered.response[0].vin], config:{ hostname:'receiver', port:4443, ca, exp:1767229200, fields:{ Location:{interval_seconds:30}, VehicleSpeed:{interval_seconds:30}, Soc:{interval_seconds:60}, Odometer:{interval_seconds:60} } } }, tokens.access_token);
await call(control, '/control/drive', { speedKmh:36 });
const result = await (await call(control, '/control/advance', { seconds:61 })).json();
console.log(JSON.stringify({ now:result.now, physical:result.physical, records:result.records }, null, 2));
