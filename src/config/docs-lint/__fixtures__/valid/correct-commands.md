---
type: guide
---

# Testing Guide with Correct Commands

This is a test fixture with correct command syntax.

## Running Tests

Use the correct syntax:

```bash
just test --file packages/cli2/src/cli.test.ts
```

Or test a package:

```bash
just test --package cli2
```

Lint with file flag:

```bash
just lint --file packages/cli2/src/cli.ts
```

Lint and fix:

```bash
just lint --file packages/cli2/src/cli.ts --fix
```

Typecheck a package:

```bash
just typecheck --package schema-engine
```

Run all tests:

```bash
just test
```

All of these should pass validation.
