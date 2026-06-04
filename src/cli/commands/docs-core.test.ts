import { describe, expect, it } from 'vitest'

import { runDocsLint } from './docs-core.js'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const VALID_BLUEPRINT = `---
doc-type: blueprint
type: blueprint
title: My Plan
status: draft
complexity: M
owner: alice
created: '2026-01-15'
last_updated: '2026-04-01'
---

# My Plan

## Product wedge anchor

- **Stage outcome:** Phase 1
- **Consuming surface:** /docs
- **New user-visible capability:** Users can read the plan.

## Summary

Minimal valid blueprint fixture.

#### Task 1.1: Do something

**Status:** todo
**Wave:** 0

- [ ] step one
`

const BLUEPRINT_WRONG_TASK_HASH = `---
doc-type: blueprint
status: planned
complexity: M
---

# My Plan

### Task 1.1: Wrong header level

**Status:** todo
`

const BLUEPRINT_INVALID_STATUS = `---
doc-type: blueprint
status: INVALID_STATUS
complexity: M
---

# My Plan
`

const NON_BLUEPRINT_DOC = `---
doc-type: guide
---

# Some guide
`

const PLAIN_MARKDOWN = `# No frontmatter

Just a markdown file.
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFs(files: Record<string, string>): {
  readFile: (p: string) => Promise<string>
  glob: (pattern: string, options: { cwd: string }) => Promise<string[]>
} {
  return {
    readFile: async (p: string) => {
      const content = files[p]
      if (content === undefined) throw new Error(`File not found: ${p}`)
      return content
    },
    glob: async (_pattern: string, { cwd }: { cwd: string }) => {
      // Return relative paths within cwd
      return Object.keys(files)
        .filter((k) => k.startsWith(cwd + '/'))
        .map((k) => k.slice(cwd.length + 1))
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runDocsLint', () => {
  describe('empty target', () => {
    it('returns 0 violations and exitCode 0 when glob finds no files', async () => {
      const deps = makeFs({})
      const result = await runDocsLint('/tmp/empty', deps)

      expect(result.files).toBe(0)
      expect(result.violations).toStrictEqual([])
      expect(result.exitCode).toBe(0)
    })
  })

  describe('non-blueprint files', () => {
    it('returns exitCode 0 when no files have doc-type blueprint', async () => {
      const deps = makeFs({
        '/tmp/docs/guide.md': NON_BLUEPRINT_DOC,
        '/tmp/docs/readme.md': PLAIN_MARKDOWN,
      })
      const result = await runDocsLint('/tmp/docs', deps)

      expect(result.exitCode).toBe(0)
      // No blueprint files found → files count reflects non-blueprint count is not stored
      expect(result.violations).toStrictEqual([])
    })
  })

  describe('valid blueprint', () => {
    it('returns 0 violations for a well-formed blueprint', async () => {
      const deps = makeFs({
        '/tmp/blueprints/plan.md': VALID_BLUEPRINT,
      })
      const result = await runDocsLint('/tmp/blueprints', deps)

      expect(result.files).toBe(1)
      expect(result.violations).toStrictEqual([])
      expect(result.exitCode).toBe(0)
    })
  })

  describe('blueprint with wrong task header (### instead of ####)', () => {
    it('returns a violation with rule blueprint-task-format', async () => {
      const deps = makeFs({
        '/tmp/blueprints/bad.md': BLUEPRINT_WRONG_TASK_HASH,
      })
      const result = await runDocsLint('/tmp/blueprints', deps)

      expect(result.files).toBe(1)
      expect(result.violations.length).toBeGreaterThan(0)
      const taskFormatViolation = result.violations.find(
        (v: { file?: string; message: string; rule: string }) => v.rule === 'blueprint-task-format',
      )
      expect(taskFormatViolation).toBeDefined()
      expect(taskFormatViolation?.file).toBe('/tmp/blueprints/bad.md')
      expect(result.exitCode).toBe(1)
    })
  })

  describe('blueprint with invalid status', () => {
    it('returns a violation with rule blueprint-status', async () => {
      const deps = makeFs({
        '/tmp/blueprints/bad-status.md': BLUEPRINT_INVALID_STATUS,
      })
      const result = await runDocsLint('/tmp/blueprints', deps)

      expect(result.files).toBe(1)
      const statusViolation = result.violations.find(
        (v: { file?: string; message: string; rule: string }) => v.rule === 'blueprint-status',
      )
      expect(statusViolation).toBeDefined()
      expect(result.exitCode).toBe(1)
    })
  })

  describe('multiple files — mixed valid and invalid', () => {
    it('aggregates violations across files', async () => {
      const deps = makeFs({
        '/tmp/mix/valid.md': VALID_BLUEPRINT,
        '/tmp/mix/invalid.md': BLUEPRINT_WRONG_TASK_HASH,
      })
      const result = await runDocsLint('/tmp/mix', deps)

      expect(result.files).toBe(2)
      expect(result.violations.length).toBeGreaterThan(0)
      const files = result.violations.map(
        (v: { file?: string; message: string; rule: string }) => v.file,
      )
      expect(files).toContain('/tmp/mix/invalid.md')
      expect(result.exitCode).toBe(1)
    })
  })

  describe('violation shape', () => {
    it('each violation has file, message, and rule fields', async () => {
      const deps = makeFs({
        '/tmp/blueprints/bad.md': BLUEPRINT_WRONG_TASK_HASH,
      })
      const result = await runDocsLint('/tmp/blueprints', deps)

      for (const v of result.violations) {
        expect(typeof v.file).toBe('string')
        expect(typeof v.message).toBe('string')
        expect(typeof v.rule).toBe('string')
      }
    })
  })
})
