# Compatibility matrix

Baseline checked 12 September 2026. Receiver: Tesla fleet-telemetry **v0.9.4**,
commit `d64c73ab65e7c5fb5fc12b35fe507e2c6054227b`, pinned image digest in Compose.
HTTP API uses the currently documented Fleet API v1 paths; Tesla does not version
all of its authentication semantics alongside the receiver version.

**Tested** below means automated local verification, never validation with a real car.

| Surface | Implemented and tested | Fidelity limits |
| --- | --- | --- |
| GET/POST `/oauth2/v3/authorize` | Local consent screen, allow/cancel, state, exact registered callback, expiring one-use consent ticket | Synthetic account; no Tesla login, MFA, ownership check or full OIDC provider |
| POST `/oauth2/v3/token` | Code exchange with client secret; refresh with client ID and refresh token; expiry, rotation, revocation | Opaque tokens; fixed 1h access/90d refresh lifetime; strict rotation without Tesla's recovery grace period; subset error shapes |
| GET `/api/1/vehicles` | Single account and synthetic vehicle; empty later pages | Fixed fixture metadata, no multi-account or large-fleet pagination |
| POST `/api/1/vehicles/fleet_status` | Paired/unpaired VIN lists and fixture firmware information | Pairing flag, not a physical/cryptographic operation; subset response fields |
| POST `/api/1/vehicles/fleet_telemetry_config` | Missing-key rejection, successful config, destination/CA checks, per-field intervals and expiry | Simulates API/proxy response boundary; no command signing, JWS or real proxy invocation |
| DELETE `/api/1/vehicles/{vin}/fleet_telemetry_config` | Stops new samples; returns `response:true` | Previously buffered observations remain available for consumer policy tests |
| Location | Protobuf locationValue, source timestamp, missing/invalid scenarios | Synthetic straight equatorial route |
| VehicleSpeed / Odometer / Soc | Tesla field enums and protobuf numeric values; miles/mph/%; coherent drive | Constant-speed/constant-consumption model; no charging model yet |
| Tesla wire transport | FlatBuffers stream envelope + protobuf over mTLS WebSocket; ACK correlation | Opens one connection per record; no persistent reconnect/backoff implementation |
| Official receiver → Redis | Decoded records on per-VIN channel; duplicate messages; certificate-derived VIN | Pub/sub is ephemeral; no durable delivery promise |
| Consumer policy | Odomojo accepts fresh records, deduplicates, rejects records across pause/resume/revoke | Laravel service acceptance test; browser and long-lived consumer process not covered |

Sampling uses whole simulation seconds, interval-driven emission and a first
sample one second after configuration. It approximates real vehicle batching,
change thresholds, firmware capabilities and scheduling. Local controls support
missing/invalid fields, delayed records, duplicates and disconnects. There are no
claims of OEM rate-limit fidelity, charging/wake/command support, PKCE, signed
commands, JWT validation, or complete API response schemas. Unsupported endpoints
return 404 rather than a fabricated success.

## Sources and reuse

- [Tesla third-party token flow](https://developer.tesla.com/docs/fleet-api/authentication/third-party-tokens)
- [Tesla vehicle endpoints](https://developer.tesla.com/docs/fleet-api/endpoints/vehicle-endpoints)
- [Tesla available telemetry data](https://developer.tesla.com/docs/fleet-api/fleet-telemetry/available-data)
- [Pinned vehicle protobuf schema](https://github.com/teslamotors/fleet-telemetry/blob/v0.9.4/protos/vehicle_data.proto)
- [Published stream envelope construction](https://github.com/teslamotors/fleet-telemetry/blob/v0.9.4/messages/tesla/flatbuffers_extension.go)
- [Receiver integration client](https://github.com/teslamotors/fleet-telemetry/blob/v0.9.4/test/integration/server_test.go)
- [Certificate identity rules](https://github.com/teslamotors/fleet-telemetry/blob/v0.9.4/messages/identity.go)
- [Redis dispatcher](https://github.com/teslamotors/fleet-telemetry/blob/v0.9.4/datastore/redis/redis.go)

The schema is vendored unmodified with its Apache-2.0 license. Receiver images are
external dependencies. This project's implementation remains MIT. Phantom Fleet
was evaluated as documented in [MVP.md](MVP.md); its GPL implementation is not copied.
