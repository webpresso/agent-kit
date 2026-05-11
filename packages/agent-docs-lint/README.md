# @webpresso/agent-docs-lint

Documentation validation, linting, and enforcement for Webpresso. Validates markdown frontmatter, structure, command safety, imports, broken links, filename conventions, and more.

## CLI Commands

After installing, the following binaries are available:

| Command | Description |
|---------|-------------|
| `docs-lint` | Validate documentation files (frontmatter, structure, content) |
| `docs-migrate` | Migrate documentation to updated formats |
| `docs-check-internal-links` | Check for broken internal links |
| `docs-check-refs` | Check documentation references |
| `docs-check-stale` | Detect stale/outdated documentation |

### Usage

```bash
# Validate all docs in the repo
docs-lint

# Validate specific files
docs-lint docs/guides/my-guide.md

# Only validate staged files (for pre-commit hooks)
docs-lint --staged

# Auto-fix where possible
docs-lint --fix

# Verbose output
docs-lint --verbose
```

## Exports

```ts
// Main entry — parsers, schemas, types
import { parseFrontmatter, getSchema, detectDocType } from '@webpresso/agent-docs-lint'

// Schemas only
import { implementationPlanSchema, ruleSchema } from '@webpresso/agent-docs-lint/schemas'

// Generator utilities
import { loadTemplate, getAvailableTemplates } from '@webpresso/agent-docs-lint/generator'
```

## Build

```bash
pnpm build   # compiles to dist/
pnpm test    # run all tests
pnpm typecheck
```
