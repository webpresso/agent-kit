# Test Spec: promote parent roadmaps in agent-kit

## Verification targets
- `src/blueprint/service/BlueprintService.ts`
- `src/blueprint/service/BlueprintService-parsing.test.ts`
- `src/cli/cli.ts`
- `src/cli/cli.test.ts`
- roadmap command router/tests as added

## Command contract
- `pnpm test -- src/blueprint/service/BlueprintService-parsing.test.ts src/cli/cli.test.ts`
- manual probes:
  - `pnpm exec ak blueprint list --json`
  - `pnpm exec ak roadmap --help`

## Success criteria
- Parent roadmaps appear in `ak blueprint list` output.
- `ak roadmap list/show` works for supported cases.
- Existing ordinary blueprint behavior stays green in focused tests.
