# Blueprint Execution Types

This directory defines the repo-owned execution control-plane contract for
Blueprint-backed execution over OMX.

## Core terms

- **Execution spec / launch spec**: The compiled execution input produced from a blueprint. The public contract name is `BlueprintExecutionSpec`, shipped in code as the `BlueprintLaunchSpec` alias.
- **Backend**: The OMX execution surface used to run the work, such as
  `omx-team` or `omx-pll-interactive`.
- **Runtime state**: Ephemeral backend/session state stored under `.omx/state/`.
- **Runtime state bridge**: The mapping from backend progress into Blueprint
  task and lifecycle state.

## Source-of-truth rule

- `webpresso/blueprints/` is the canonical plan store.
- `.omx/state/` is runtime/session/backend state only.
- `.omx/plans/` is derived handoff metadata only, never the canonical plan.
- Completion authority stays in Blueprint task-local canonical verification
  evidence; OMX runtime progress and handoff files cannot mark work complete on
  their own.
- When `.omx/plans/` exists, handoff files may carry optional provenance links
  such as Codex thread / goal and OMX session / ledger pointers. Those links
  are correlation metadata only, not plan authority.

These types are intentionally backend-oriented but backend-agnostic. Runtime
implementation code should consume them later without redefining the contract.
