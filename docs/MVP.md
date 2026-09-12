# First milestone: Odomojo against a synthetic Tesla

Decision: 12 September 2026. First application: **Odomojo**. First adapter: Tesla.
BMW follows after the first adapter's acceptance tests are stable; Tagless is a
later consumer. The current version is a headless prototype, not a complete OEM
emulator or a release certified against real vehicles.

## Acceptance gates

| Gate | Verification |
| --- | --- |
| Consent and code exchange without OEM credentials | Node HTTP tests and external Odomojo test |
| Discovery and enrollment do not imply live data | Odomojo test checks empty snapshot and tracking disabled |
| Pairing alone does not activate collection | Core/API tests and Odomojo setup checks |
| Explicit activation configures telemetry | Real HTTPS API call, with CA verification, from Odomojo |
| Four coherent signals reach normal ingestion | Official receiver mTLS → decoded Redis pub/sub → Odomojo decoder/ingestor |
| Duplicate delivery is idempotent | Same event resent through receiver, one persisted event |
| Old buffered records cannot cross policy changes | Replayed through receiver after pause, resume, and revocation; no persistence |
| Missing location is not replaced by odometer freshness | Odometer-only receiver record accepted without location snapshot |
| Reset reproduces physical state, values and source times | Node deterministic scenario test |

The external acceptance test calls the same decoder used by `tesla:consume`,
after reading actual receiver messages via Predis. Its SQLite transaction remains
in one process. The standalone consumer process, browser UI, production queues,
and real OEM flows are separate future gates.

## Architecture and choices

Node.js 24, plain ECMAScript modules, built-in HTTP server and test runner. The
small dependency set handles FlatBuffers, protobuf and WebSocket transport;
Redis is a test dependency only. No build step or framework is needed to run.

`src/core.js` owns physical state, simulation clock and immutable observation
records. `src/server.js` maps Tesla-shaped HTTP requests and scenario controls.
`src/wire.js` uses Tesla's published protobuf schema and envelope layout to send
messages to the pinned official receiver. Physical state uses km/kmh; the Tesla
adapter transmits miles/mph. Protocol/auth tokens are intentionally random; only
scenario state and observations are deterministic.

Control and provider APIs use separate listeners. Mutation requests are serialized
so advancing time, delivery and reset cannot interleave. Time advances explicitly;
there is no background wall-clock simulation. Per-field intervals start with a
sample one second after configuration. Sampling continues during a simulated
transport outage; buffered observations retain their original timestamps.

A test CA is generated locally and trusted only by this receiver. The vehicle
certificate has a synthetic VIN subject. The receiver's issuer-name check requires
`TeslaMotors` as the local CA's common name; this is still a locally generated
certificate, not a Tesla credential. HTTPS verification remains enabled.

## Existing-project decision

[Phantom Fleet](https://github.com/patrickdemers6/phantom-fleet) already sends mocked
messages to the Tesla receiver through file/API input and supports telemetry
configuration. Its documented focus is useful for isolated receiver tests; it
is not the OAuth/discovery/collection-policy acceptance harness needed here.
Its GPL-3.0 implementation is not incorporated into this MIT project.

We reuse Tesla's Apache-2.0 schema and run the official receiver, while keeping
the small sender independent. Re-evaluate a Phantom Fleet bridge if its scenario
or transport coverage would eliminate substantial duplicated maintenance.

No production credentials, customer data, or changes to an OEM account are part
of this milestone.
