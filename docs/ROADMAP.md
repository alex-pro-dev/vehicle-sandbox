# Roadmap

## 0.1 — First runnable slice

Implemented: deterministic single-vehicle core; separate control API; Tesla-shaped
authorization, refresh, discovery, pairing readiness and telemetry configuration;
four-signal driving; delayed/missing/invalid/duplicate data and transport outages;
official receiver wire test; external Odomojo service acceptance test.

The [coverage matrix](COMPATIBILITY.md) states exactly what is simulated and which
production behaviors remain outside the first milestone.

## Next — Developer feedback through Odomojo

- Walk the real browser onboarding UI against the sandbox, then run its standalone
  `tesla:consume` process against an isolated application database.
- Add reusable scenario files, persistent WebSocket sessions and bounded reconnect.
- Broaden failure cases: unsupported firmware/hardware, config capacity, per-field
  stale values, missing timestamps, provider errors and token recovery grace.
- Provide a small garage control UI and improve request inspection.
- Check assumptions against sanitized observations from actual Tesla vehicles.

## Then — Generalize

- BMW as the second OEM adapter, after inspecting the application's actual API
  contract and documenting provider-specific auth and telemetry behavior.
- Multiple vehicles/accounts and tenant isolation scenarios.
- Charging, parking/sleep and asynchronous command effects.
- Tagless as an additional consumer; avoid coupling the core to one application.
- Reusable CI scenarios and additional OEM adapters with explicit compatibility
  matrices. Evaluate upstream reuse before each transport implementation.
