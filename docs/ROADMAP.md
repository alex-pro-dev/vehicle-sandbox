# Roadmap

This document records proposed work. No adapter support is currently implemented.

## 1. Establish the first test cases

- Select two direct OEM integrations and identify five concrete integration
  failures or workflows to reproduce.
- Record their API versions, transport protocols, authentication flows, and
  required vehicle capabilities.
- Evaluate [Phantom Fleet](https://github.com/patrickdemers6/phantom-fleet),
  [KnowGo](https://github.com/knowgoio/knowgo-vehicle-simulator), and generic
  stateful HTTP mocking tools against those cases.
- Decide what to reuse or integrate, respecting each dependency's license.
- Choose the implementation language and document the reasoning.

## 2. Build a deterministic core

- Vehicle identity, capabilities, and coherent driving/charging/sleep states.
- Separate simulated vehicle state from each API's last observed data, including
  per-signal timestamps and missing or stale values.
- Controllable simulation time, deterministic randomness, and scenario reset.
- A separate control API for test setup and fault injection.

## 3. Implement native OEM adapters

- Expose the selected OEM's request and response formats at configurable local
  endpoints, preserving the application's existing integration code paths.
- Simulate the relevant authentication and consent lifecycle using test accounts.
- Implement the supported telemetry transport and asynchronous command behavior.
- Publish coverage by endpoint, API version, capability, and scenario.
- Mark behavior as documented, validated against a real vehicle, or approximate.

## 4. Exercise failures and replay

- Consent revoked or token refresh rejected.
- Vehicle offline or asleep, with delayed wake-up where applicable.
- Charging interrupted or a command accepted without immediate completion.
- Stale readings, missing fields, and provider-specific rate limits.
- Stream interruptions, delayed messages, and duplicate delivery where applicable.
- Replay sanitized recordings with identifiers and timestamps controlled by tests.

## 5. Package the first usable release

- One documented local startup command and a headless CI workflow.
- A minimal UI to inspect state and run scenarios.
- Adapter contract checks and an end-to-end example application.

Acceptance target: a clean machine can reproduce the five selected scenarios
through the two native API adapters without live OEM credentials or a real car.
This target does not imply full fidelity or production certification.
