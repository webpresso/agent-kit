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
    `ak-audit-hooks-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tmpDir, { recursive: true })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

const preCommitPath = (root: string): string => path.join(root, '.husky', 'pre-commit')

describe('scaffoldAuditHooks', () => {
  it('creates .husky/pre-commit with shebang and audit lines when missing', async () => {
    const result = scaffoldAuditHooks({ repoRoot: tmpDir, options: {} })
    expect(result.action).toBe('created')
    expect(result.preCommitPath).toBe(preCommitPath(tmpDir))

    const content = await readFile(preCommitPath(tmpDir), 'utf8')
    expect(content).toContain('#!/bin/sh')
    expect(content).toContain('ak audit skill-sizes --staged')
    expect(content).toContain('ak audit broken-refs --staged')
    expect(content).toContain('# agent-kit audit hooks (staged mode — fast)')
  })

  it('is idempotent — returns identical when lines already present', async () => {
    // Create the hook file with the lines already present
    await mkdir(path.join(tmpDir, '.husky'), { recursive: true })
    await writeFile(
      preCommitPath(tmpDir),
      [
        '#!/bin/sh',
        '# agent-kit audit hooks (staged mode — fast)',
        'ak audit skill-sizes --staged',
        'ak audit broken-refs --staged',
        '',
      ].join('\n'),
      'utf8',
    )

    const result = scaffoldAuditHooks({ repoRoot: tmpDir, options: {} })
    expect(result.action).toBe('identical')
  })

  it('appends missing lines to existing hook without removing existing content', async () => {
    await mkdir(path.join(tmpDir, '.husky'), { recursive: true })
    await writeFile(preCommitPath(tmpDir), '#!/bin/sh\npnpm lint\n', 'utf8')

    const result = scaffoldAuditHooks({ repoRoot: tmpDir, options: {} })
    expect(result.action).toBe('appended')

    const content = await readFile(preCommitPath(tmpDir), 'utf8')
    expect(content).toContain('pnpm lint')
    expect(content).toContain('ak audit skill-sizes --staged')
    expect(content).toContain('ak audit broken-refs --staged')
  })

  it('only appends the missing subset when some lines already present', async () => {
    await mkdir(path.join(tmpDir, '.husky'), { recursive: true })
    await writeFile(preCommitPath(tmpDir), '#!/bin/sh\nak audit skill-sizes --staged\n', 'utf8')

    const result = scaffoldAuditHooks({ repoRoot: tmpDir, options: {} })
    expect(result.action).toBe('appended')

    const content = await readFile(preCommitPath(tmpDir), 'utf8')
    expect(content).toContain('ak audit skill-sizes --staged')
    expect(content).toContain('ak audit broken-refs --staged')
    // skill-sizes should appear exactly once
    const matches = content.match(/ak audit skill-sizes --staged/g) ?? []
    expect(matches).toHaveLength(1)
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
