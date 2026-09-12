# Odomojo acceptance client

This example needs an existing Odomojo checkout and its configured Docker backend.
It is an external acceptance test, not bundled application source. It uses a fresh
in-memory SQLite database via Odomojo's PHPUnit settings and synthetic fixtures.
No production environment or database is used.

## Endpoint seam required in Odomojo

Its Tesla configuration must expose `tesla.authorize_url`, `tesla.token_url`, and
`tesla.audience`, and the controller/client must read those settings instead of
hardcoding the authorize/token URLs. Retain the normal Tesla defaults and allow
the following environment overrides **only when APP_ENV is local or testing**:

- `TESLA_SANDBOX_AUTHORIZE_URL`
- `TESLA_SANDBOX_TOKEN_URL`
- `TESLA_SANDBOX_AUDIENCE`

The first acceptance run added this small change and a production/staging exclusion
test in the local Odomojo checkout. The external test configures those keys at
runtime. Odomojo's existing proxy CA verification is retained: the local HTTPS
API serves the synthetic certificate rather than disabling TLS verification.

## Run

From vehicle-sandbox:

```sh
npm ci
npm run up:odomojo
```

From a second terminal in vehicle-sandbox:

```sh
npm run test:odomojo -- /absolute/path/to/odoMojo
```

The runner invokes Odomojo's own Docker Compose backend with this sandbox mounted
read-only at `/sandbox`. It does not install another PHP runtime or start/change
Odomojo's normal application services. Docker Desktop's `host.docker.internal`
must resolve to the host. Linux hosts need an equivalent host-gateway mapping
and networking arrangement; that topology has not been validated here.

The test sends real HTTP requests to the Node API and reads actual official
receiver output from a dedicated Redis connection. It invokes the production
`TelemetryDecoder`/ingestion services after reading each message, so assertions
and the SQLite transaction stay in one PHP process. It does not replace provider
responses with `Http::fake`, inject observations directly into Redis, run the
browser UI, or start the separate long-running `tesla:consume` process.

## Assertions

OAuth state/session binding, code exchange and refresh precede discovery and
enrollment. Pairing is checked before activation. The test verifies empty
observations before activation, then speed/distance/SOC and source times after a
synthetic drive, idempotent resends, missing-location behavior, and rejection of
buffered observations after pause, resume and provider revocation.

Both the application test clock and simulator clock are advanced explicitly.
The test respects the application's setup throttle window by advancing both
clocks; it does not disable tenant/auth/policy middleware.

## Browser setup (next acceptance gate)

For a local Odomojo backend, configure the three sandbox URL overrides, synthetic
client ID/secret and localhost callback. In Docker, token/audience URLs use
`http://host.docker.internal:8090`, while the browser authorization URL can use
`http://localhost:8090/oauth2/v3/authorize`. Set the proxy to
`https://host.docker.internal:8444` and mount the generated CA as its trusted CA.
The receiver config host/port must match `receiver:4443`; Redis output is exposed
on the host at port 6399. Configure a separate local application database and
start its normal consumer for manual UI testing. Do not change production
settings or point a live account at this fixture.
