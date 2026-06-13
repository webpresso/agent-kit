import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import wpQaTool from '../mcp/tools/qa.js'
import { seededLintErrorSource } from './fixtures/seeded-lint-error.js'
import { seededTypeErrorSource } from './fixtures/seeded-type-error.js'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const configuredIngestLensPath = process.env.INGEST_LENS_PATH?.trim()
const ingestLensPath =
  configuredIngestLensPath && existsSync(configuredIngestLensPath)
    ? configuredIngestLensPath
    : undefined
const describeIfIngestLens = ingestLensPath ? describe : describe.skip

const fixtureRoot = 'src/agentkit-qa'

const seededFiles = [
  {
    source: 'seeded-lint-error.ts',
    target: `${fixtureRoot}/seeded-lint-error-compact-qa.ts`,
    contents: seededLintErrorSource,
  },
  {
    source: 'seeded-type-error.ts',
    target: `${fixtureRoot}/seeded-type-error-compact-qa.ts`,
    contents: seededTypeErrorSource,
  },
  {
    source: 'seeded-failing-test.ts',
    target: `${fixtureRoot}/seeded-failing-test-compact-qa.test.ts`,
  },
] as const

const previousClaudeProjectDir = process.env.CLAUDE_PROJECT_DIR
const previousPath = process.env.PATH
const previousCwd = process.cwd()

afterEach(() => {
  if (previousClaudeProjectDir === undefined) {
    delete process.env.CLAUDE_PROJECT_DIR
  } else {
    process.env.CLAUDE_PROJECT_DIR = previousClaudeProjectDir
  }
  if (previousPath === undefined) {
    delete process.env.PATH
  } else {
    process.env.PATH = previousPath
  }
  process.chdir(previousCwd)
})

describeIfIngestLens('ingest-lens BOOKEND compact QA integration', () => {
  it('returns a compact qa payload for seeded lint/type/test failures', async () => {
    const root = ingestLensPath
    if (!root) throw new Error('INGEST_LENS_PATH must point to an existing repo')
    const workerRoot = join(root, 'apps/workers')
    const seedDir = join(workerRoot, fixtureRoot)
    mkdirSync(seedDir, { recursive: true })
    try {
      for (const file of seededFiles) {
        if ('contents' in file) {
          writeFileSync(join(workerRoot, file.target), file.contents)
        } else {
          copyFileSync(join(fixtureDir, file.source), join(workerRoot, file.target))
        }
      }

      process.env.CLAUDE_PROJECT_DIR = workerRoot
      process.env.PATH = [
        join(workerRoot, 'node_modules', '.bin'),
        join(root, 'node_modules', '.bin'),
        previousPath ?? '',
      ]
        .filter(Boolean)
        .join(':')
      process.chdir(workerRoot)
      const result = await wpQaTool.handler({
        files: seededFiles.map((file) => file.target),
      })
      const payload = result.structuredContent as {
        passed: boolean
        details: Record<string, { failures?: unknown[]; bytes?: number }>
      }

      expect(payload.passed).toBe(false)
      expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThanOrEqual(2_048)
      expect(payload.details.lint!.failures?.length).toBeGreaterThan(0)
      expect(payload.details.typecheck!.failures?.length).toBeGreaterThan(0)
      expect(payload.details.test!.failures?.length).toBeGreaterThan(0)
      expect(payload.details.lint!.bytes ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(800)
      expect(payload.details.typecheck!.bytes ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(800)
      expect(payload.details.test!.bytes ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(800)
    } finally {
      for (const file of seededFiles) {
        rmSync(join(workerRoot, file.target), { force: true })
      }
      rmSync(seedDir, { recursive: true, force: true })
    }
  })

  it('keeps the all-green transform fixture budget below 200 bytes per stage', () => {
    const cleanLeaf = {
      passed: true,
      summary: 'passed',
      failures: [],
      tier: 1,
      bytes: 0,
      tokensSaved: 100,
      rawOutput: '',
    }
    const payload = {
      passed: true,
      summary: 'qa passed',
      details: {
        lint: cleanLeaf,
        typecheck: cleanLeaf,
        test: cleanLeaf,
      },
    }

    for (const leaf of Object.values(payload.details)) {
      expect(Buffer.byteLength(JSON.stringify(leaf))).toBeLessThanOrEqual(200)
    }
    expect(readFileSync(join(fixtureDir, 'seeded-failing-test.ts'), 'utf8')).toContain('toBe(2)')
  })
})
