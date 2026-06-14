import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fsMocks = vi.hoisted(() => ({
  openSync: vi.fn(),
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    openSync: fsMocks.openSync,
  }
})

import { hashAgentDir, runCompile } from './compile.js'

describe('compile command', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'wp-compile-lock-'))
    fsMocks.openSync.mockImplementation(() => {
      throw new Error('compile lock acquisition must not call openSync')
    })
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('acquires the compile lock with a path-based exclusive write', async () => {
    mkdirSync(join(cwd, 'node_modules', '.bin'), { recursive: true })
    writeFileSync(join(cwd, 'node_modules', '.bin', 'rulesync'), '#!/bin/sh\n', 'utf8')
    const agentDir = join(cwd, '.agent')
    mkdirSync(agentDir, { recursive: true })
    writeFileSync(
      join(agentDir, '.compile-manifest.json'),
      `${JSON.stringify({
        version: 1,
        timestamp: new Date(0).toISOString(),
        sourceHash: hashAgentDir(agentDir),
        outputHashes: {},
      })}\n`,
      'utf8',
    )

    const result = await runCompile({ cwd, targets: 'codex' })

    expect(result).toMatchObject({ ok: true, noOp: true })
    expect(fsMocks.openSync).not.toHaveBeenCalled()
    expect(existsSync(join(agentDir, '.compile.lock'))).toBe(false)
  })
})
