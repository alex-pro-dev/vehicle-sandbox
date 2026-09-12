# Vehicle Sandbox

A virtual garage for connected-car developers.

An open-source vehicle API simulator for testing direct OEM integrations,
onboarding, telemetry, and commands without a real car.

## Status

Project initialization and design. No runnable simulator or OEM adapter is
implemented yet. The features below describe the intended scope.

## Why

Connected-car applications depend on manufacturer-specific authentication,
vehicle APIs, and telemetry delivery. Reproducing a sleeping vehicle, an expired
token, or an interrupted charging session can require access to a real vehicle.

Vehicle Sandbox aims to make these situations reproducible on a developer's
machine and in continuous integration.

## Intended capabilities

- Native OEM API adapters with documented endpoint and behavior coverage.
- Simulated authorization, consent, token lifecycle, and vehicle linking.
- Consistent vehicle state across driving, parking, sleeping, and charging.
- Telemetry delivery and command effects appropriate to each supported adapter.
- Configurable failures, stale data, delays, and connection interruptions.
- Deterministic scenarios with a controllable clock and resettable state.
- A headless runner and a simple UI for controlling a virtual garage.

Applications will point their test configuration at local emulator endpoints.
Real OEM registration, ownership verification, and production key pairing still
require validation against the relevant OEM service and supported vehicles.

## Initial direction

Start with a small scenario engine and two OEM integrations. Adapter selection
and implementation language are still to be decided. Evaluate existing projects
before implementing overlapping functionality.

See [the roadmap](docs/ROADMAP.md) for the first milestones.

## Contributing

Useful contributions include reproducible integration problems, public API
references, proposed scenarios, and sanitized sample payloads. Include the API
version and relevant region or vehicle capabilities when known.

Do not submit credentials, tokens, private keys, real VINs, precise personal
location histories, or proprietary material you cannot share. Describe whether
behavior was observed on a real vehicle, documented by the OEM, or assumed.

## License

[MIT](LICENSE). Independent community project; not affiliated with any vehicle
manufacturer. OEM names identify the integrations being discussed.
