import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { scaffoldAuditHooks } from './index.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = path.join(
    os.tmpdir(),
    `wp-audit-hooks-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tmpDir, { recursive: true })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

const preCommitPath = (root: string): string => path.join(root, '.husky', 'pre-commit')

describe('scaffoldAuditHooks', () => {
  it('creates .husky/pre-commit with shebang and comment header when missing', async () => {
    const result = scaffoldAuditHooks({ repoRoot: tmpDir, options: {} })
    expect(result.action).toBe('created')
    expect(result.preCommitPath).toBe(preCommitPath(tmpDir))

    const content = await readFile(preCommitPath(tmpDir), 'utf8')
    expect(content).toContain('#!/bin/sh')
    expect(content).toContain('# agent-kit audit hooks (staged mode — fast)')
    // Dead verbs removed — skill-sizes and broken-refs no longer emitted
    expect(content).not.toContain('skill-sizes')
    expect(content).not.toContain('broken-refs')
  })

  it('is idempotent — returns identical when comment header already present', async () => {
    await mkdir(path.join(tmpDir, '.husky'), { recursive: true })
    await writeFile(
      preCommitPath(tmpDir),
      '#!/bin/sh\n# agent-kit audit hooks (staged mode — fast)\n',
      'utf8',
    )

    const result = scaffoldAuditHooks({ repoRoot: tmpDir, options: {} })
    expect(result.action).toBe('identical')
  })

  it('appends comment header to existing hook without removing existing content', async () => {
    await mkdir(path.join(tmpDir, '.husky'), { recursive: true })
    await writeFile(preCommitPath(tmpDir), '#!/bin/sh\npnpm lint\n', 'utf8')

    const result = scaffoldAuditHooks({ repoRoot: tmpDir, options: {} })
    expect(result.action).toBe('appended')

    const content = await readFile(preCommitPath(tmpDir), 'utf8')
    expect(content).toContain('pnpm lint')
    expect(content).toContain('# agent-kit audit hooks (staged mode — fast)')
  })

  it('is idempotent on a file that had the old dead verbs — does not add them again', async () => {
    // Existing hooks may still have old lines from previous wp setup runs
    await mkdir(path.join(tmpDir, '.husky'), { recursive: true })
    await writeFile(
      preCommitPath(tmpDir),
      '#!/bin/sh\n# agent-kit audit hooks (staged mode — fast)\nwp audit skill-sizes --staged\nwp audit broken-refs --staged\n',
      'utf8',
    )

    const result = scaffoldAuditHooks({ repoRoot: tmpDir, options: {} })
    // Header is present → identical (does not add new lines)
    expect(result.action).toBe('identical')

    const content = await readFile(preCommitPath(tmpDir), 'utf8')
    // Dead verbs are not added again; they remain as-is from the existing file
    const headerCount = (content.match(/# agent-kit audit hooks/g) ?? []).length
    expect(headerCount).toStrictEqual(1)
  })

  it('skips writes in dry-run mode', async () => {
    const result = scaffoldAuditHooks({ repoRoot: tmpDir, options: { dryRun: true } })
    expect(result.action).toBe('skipped-dry')
    expect(existsSync(preCommitPath(tmpDir))).toBe(false)
  })

  it('creates .husky dir when it does not exist', async () => {
    // No .husky dir; should be created automatically
    expect(existsSync(path.join(tmpDir, '.husky'))).toBe(false)
    scaffoldAuditHooks({ repoRoot: tmpDir, options: {} })
    expect(existsSync(path.join(tmpDir, '.husky'))).toBe(true)
  })
})
