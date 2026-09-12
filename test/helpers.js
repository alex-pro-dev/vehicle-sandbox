import { once } from 'node:events';
import { sandbox } from '../src/server.js';
export const scope = 'openid offline_access vehicle_device_data vehicle_location';
export const redirectUri = 'http://localhost:8091/api/v1/oauth/tesla/callback';
export async function running(t, options = {}) {
  const app = sandbox(options);
  const servers = app.createServers();
  for (const server of servers) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); }
  t.after(() => Promise.all(servers.map(server => new Promise(resolve => server.close(resolve)))));
  const [api, control] = servers.map(server => `http://127.0.0.1:${server.address().port}`);
  const request = async (base, path, data, token, method = 'POST') => fetch(base + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(method === 'GET' ? {} : { body: JSON.stringify(data ?? {}) }), redirect: 'manual',
  });
  const authorize = async (decision = 'allow') => {
    const page = await fetch(`${api}/oauth2/v3/authorize?${new URLSearchParams({ client_id: 'sandbox-client', redirect_uri: redirectUri, response_type: 'code', scope, state: 'test-state' })}`);
    const ticket = (await page.text()).match(/name="ticket" value="([^"]+)"/)[1];
    const consent = await request(api, '/oauth2/v3/authorize', { ticket, decision });
    return new URL(consent.headers.get('location'));
  };
  const exchange = async code => request(api, '/oauth2/v3/token', { grant_type: 'authorization_code', code, client_id: 'sandbox-client', client_secret: 'sandbox-secret', redirect_uri: redirectUri, audience: options.audience ?? 'http://localhost:8090' });
  const login = async () => (await exchange((await authorize()).searchParams.get('code'))).json();
  return { ...app, api, control, request, authorize, exchange, login };
}
export function config(epoch, fields = ['Location','VehicleSpeed','Soc','Odometer']) {
  return { hostname: 'receiver', port: 4443, ca: 'test-ca', exp: Math.floor(Date.parse(epoch) / 1000) + 3600,
    fields: Object.fromEntries(fields.map(k => [k, { interval_seconds: k === 'Soc' || k === 'Odometer' ? 60 : 30 }])) };
}
