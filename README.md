# Vehicle Sandbox

A virtual garage for connected-car developers. Test direct OEM onboarding and
telemetry integrations without a real vehicle.

**Early runnable prototype: Tesla first, Odomojo as the first acceptance client.**
One synthetic vehicle, OAuth consent and token lifecycle, discovery, simulated
pairing, telemetry configuration, and deterministic driving are implemented.
Location, VehicleSpeed, Soc and Odometer can travel through Tesla's official
receiver over mTLS/WebSocket into Redis. No live OEM credentials are needed.

## Quick start

Requires Node.js 24+. Docker Compose and OpenSSL are needed for the receiver.

```sh
npm ci
npm test
npm run up
```

This generates disposable local certificates, starts an isolated official Tesla
receiver and Redis, and runs the sandbox on loopback. In another terminal:

```sh
npm run demo
npm run test:receiver
```

The demo resets the garage, authorizes a synthetic account, pairs and configures
the vehicle, and advances a 61-second drive. Its printed records show source
timestamps and delivery acknowledgments. **The demo resets existing scenario
state**, so use a separate run from application acceptance testing.

For an HTTP-only simulator without Docker, use `npm start`; records accumulate
in the control API without wire delivery. If you previously generated certificates,
the HTTPS API is also available. Ctrl-C stops the Node listeners;
`docker compose down` stops this project's receiver and Redis.

| Listener | Purpose |
| --- | --- |
| `http://localhost:8090` | Tesla-shaped authorization, token and Fleet API routes |
| `https://localhost:8444` | Same API with the generated test CA, for clients that pin TLS |
| `http://localhost:8099/control/state` | Separate scenario control and captured records |
| `wss://localhost:4443/` | Official receiver, requires the synthetic client certificate |
| `redis://localhost:6399` | Isolated receiver output, channel `odomojo_V_{SANDB0X0000000001}` |

Test client ID: `sandbox-client`; test secret: `sandbox-secret`.
Default registered callback: `http://localhost:8091/api/v1/oauth/tesla/callback`.
API listeners bind to `127.0.0.1`. This unauthenticated control plane is intended
for a developer machine or isolated CI job, not a public deployment.

## Odomojo acceptance

See [the Odomojo guide](examples/odomojo/README.md). With its small endpoint
configuration change applied and local Docker backend prepared:

```sh
npm run up:odomojo
# In another terminal:
npm run test:odomojo -- /path/to/odoMojo
```

The external test uses Odomojo's authenticated routes and real provider HTTP
calls, the official receiver, and its normal decoder/ingestion services with an
in-memory test database. It covers explicit activation, token refresh, duplicate
handling, missing location, and rejection after pause/resume or revocation.
It does not drive the browser UI or run the long-lived `tesla:consume` process.

## Coverage and limits

- [Control API and scenarios](docs/CONTROL_API.md)
- [MVP scope and acceptance gates](docs/MVP.md)
- [Compatibility matrix and upstream references](docs/COMPATIBILITY.md)
- [Roadmap](docs/ROADMAP.md)

Pairing is an explicit test flag. The sandbox acts as the API/proxy boundary;
it does not implement Tesla ownership verification, real key pairing, signed
vehicle commands, or the actual command proxy. Only the documented subset is
supported; other endpoints fail explicitly. No real-vehicle validation is claimed.

## Contributing and license

Reproducible failures, new adapter contracts, and synthetic fixtures are welcome.
Keep credentials, real VINs, private keys, customer data and personal location
histories out of contributions. State whether behavior is documented, observed
on a real vehicle, or an approximation.

[MIT](LICENSE), except the [vendored Tesla schema](vendor/tesla/README.md), which
retains Apache-2.0. Independent community project, unaffiliated with any OEM.
