---
type: guide
---

# Guide with Non-Bash Code Blocks

This document has deprecated commands in non-bash code blocks, which should NOT be flagged.

## TypeScript Example

```typescript
// Example of command execution in TypeScript
const result = await runCommand('just lint-file src/index.ts')
const test = 'pnpm vitest'
```

## JSON Example

```json
{
  "scripts": {
    "test": "just test file packages/cli2",
    "lint": "just lint-file src/"
  }
}
```

## YAML Example

```yaml
commands:
  - just typecheck cli2
  - pnpm vitest
```

These should all be ignored since they're not bash code blocks.

## Correct Bash Commands

```bash
just lint --file src/index.ts
just test --package cli2
```
