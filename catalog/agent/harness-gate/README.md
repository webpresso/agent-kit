# Harness regression gate consumers

This directory declares deterministic reference-consumer suites for the harness gate.

- `consumers.yaml` is the agent-kit side of the contract consumed by the local runner.
- Each downstream consumer owns `harness-gate/suites.yaml` with the concrete commands.
- `heldInSuites` are expected to stay stable on normal harness changes.
- `heldOutSuites` are stronger confidence checks used before declaring a change release-ready.

Suite IDs are stable and must be cited in regression verdict evidence.
