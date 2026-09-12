# Scenario control API

Separate listener: `http://localhost:8099`. POST bodies must be JSON objects.
The API rejects requests with a browser Origin header and does not enable CORS.
No real authentication is provided; use only loopback or an isolated CI network.

All successful operations return the full current snapshot. `GET /control/state`
returns the clock, vehicle, physical state, grant/pair/config flags, fault settings
and retained records. Tokens are not exposed in this snapshot.

| POST path | Body | Effect |
| --- | --- | --- |
| `/control/reset` | `{}` or `{"epoch":"2026-01-01T00:00:00Z"}` | Clears grants, codes, tokens, config, faults and all observations; resets car and clock |
| `/control/pair` | `{"paired":true}` | Simulates key readiness; emits nothing |
| `/control/drive` | `{"speedKmh":36}` | Sets constant speed, 0–200 km/h; zero parks the car |
| `/control/advance` | `{"seconds":61}` | Advances 0–3600 whole seconds, samples configured fields, flushes due records |
| `/control/faults` | `{"missing":["Location"],"invalid":[],"delaySeconds":30,"copies":2,"disconnected":false}` | Partial update of future sampling/delivery behavior |
| `/control/replay` | `{"id":0}` | Sends a retained observation again, even after config/grant removal, to test downstream rejection |
| `/control/revoke` | `{}` | Revokes tokens and grant, removes config; preserves buffered records for rejection tests |

Example, after the application has configured telemetry:

```sh
curl -sS http://localhost:8099/control/drive \
  -H 'Content-Type: application/json' -d '{"speedKmh":36}'
curl -sS http://localhost:8099/control/advance \
  -H 'Content-Type: application/json' -d '{"seconds":61}'
```

Default epoch is fixed at 2026-01-01 UTC, not wall time. For an application using
the real clock, reset with its current UTC time or freeze/advance both clocks in
the test. The Odomojo acceptance test does the latter. Reset truncates to seconds.
A normal demo uses the fixed epoch; old observations are expected to fail a real
application's retention policy.

Initial state: synthetic VIN `SANDB0X0000000001`, 10,000 km, 80% SoC, stationary
at latitude/longitude 0,0. Driving moves east on the equator at the requested
speed, consuming 0.18 kWh/km from an assumed 60 kWh battery. These are simple
fixture assumptions, not a model of Tesla battery or driving physics.

Missing fields are omitted. Invalid fields use `invalid:true`. Delay is 0–86400
simulation seconds. Copies are 1–3; extra copies set `isResend`. Record timestamps
and values are captured at observation time. Changing faults does not rewrite
already buffered records. A transport disconnect suppresses delivery, not sampling.

An advance commits physical time and captures records before sending. If delivery
fails, the API returns 502 and preserves unsent copies. Retry delivery with
`{"seconds":0}` to avoid advancing time twice. A lost ACK can cause a resend;
the consumer must deduplicate. Records are retained in memory (up to a conservative
20,000-record/step bound); use reset between scenarios. Restart loses all state.

The configured receiver hostname, port and CA must match the launch configuration;
request data cannot redirect the sender to arbitrary hosts. The actual wire
endpoint is selected by the trusted `SANDBOX_RECEIVER_URL` environment variable.

## Launch configuration

| Variable | Default |
| --- | --- |
| `SANDBOX_BIND` | `127.0.0.1`; applies to both API and control listeners |
| `SANDBOX_CERTS` | `.vehicle-sandbox/certs` |
| `SANDBOX_AUDIENCE` | `http://localhost:8090` |
| `SANDBOX_REDIRECT_URI` | `http://localhost:8091/api/v1/oauth/tesla/callback` |
| `SANDBOX_RECEIVER_URL` | unset (capture only); `npm run up` sets `wss://localhost:4443/` |
| `SANDBOX_RECEIVER_HOST` | `receiver` (expected telemetry config hostname) |
| `SANDBOX_RECEIVER_PORT` | `4443` (expected telemetry config port) |

Changing `SANDBOX_BIND` exposes the unauthenticated control API on that interface.
`up:odomojo` sets the audience to `http://host.docker.internal:8090` for the Docker
backend. The demo requires the same audience if used in that mode.
