import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const stateRoot = vi.hoisted(() => ({ path: '' }))

vi.mock('#paths/state-root.js', () => ({
  getSurfacePath: vi.fn((name: string, _scope: 'repo' | 'worktree' | 'user') =>
    join(stateRoot.path, name),
  ),
}))

import { emitCliCommandOutput, runCliCommandSequence } from './quality-runner.js'

describe('quality runner', () => {
  beforeEach(() => {
    stateRoot.path = mkdtempSync(join(tmpdir(), 'wp-quality-runner-'))
  })

  afterEach(() => {
    rmSync(stateRoot.path, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('persists combined stdout/stderr for a scoped run', async () => {
    const script = join(stateRoot.path, 'emit.js')
    writeFileSync(
      script,
      "process.stdout.write('alpha\\n'); process.stderr.write('beta\\n');",
      'utf8',
    )

    const result = await runCliCommandSequence({
      commandName: 'test',
      commands: [{ command: process.execPath, args: [script] }],
      summary: ({ exitCode }) => (exitCode === 0 ? 'test passed' : 'test failed'),
    })

    const raw = result.entry.logPath
    expect(raw).toContain('cli-logs')
    expect(readText(raw)).toContain('alpha')
    expect(readText(raw)).toContain('beta')
  })

  it('prints summary-first output by default and raw output with --full', async () => {
    const script = join(stateRoot.path, 'fail.js')
    writeFileSync(
      script,
      "process.stdout.write('src/example.test.ts:3:5 - error TS2322: boom\\n'); process.exit(1);",
      'utf8',
    )

    const result = await runCliCommandSequence({
      commandName: 'typecheck',
      commands: [{ command: process.execPath, args: [script] }],
      summary: ({ exitCode }) => `typecheck failed (exit ${exitCode})`,
    })

    const defaultWrites: string[] = []
    emitCliCommandOutput({
      entry: result.entry,
      summary: result.entry.summary ?? '',
      passed: false,
      toolName: 'wp_typecheck',
      stdout: { write: (chunk: string) => (defaultWrites.push(chunk), true) },
    })

    const fullWrites: string[] = []
    emitCliCommandOutput({
      entry: result.entry,
      summary: result.entry.summary ?? '',
      passed: false,
      full: true,
      toolName: 'wp_typecheck',
      stdout: { write: (chunk: string) => (fullWrites.push(chunk), true) },
    })

    expect(defaultWrites.join('')).toContain('typecheck failed (exit 1)')
    expect(defaultWrites.join('')).toContain('TS2322')
    expect(defaultWrites.join('')).toContain('Full log: wp logs typecheck')
    expect(fullWrites.join('')).toContain('error TS2322: boom')
    expect(fullWrites.join('')).not.toContain('Full log: wp logs typecheck')
  })

  it('handles large output without truncating persisted raw logs', async () => {
    const payload = 'x'.repeat(400_000)
    const script = join(stateRoot.path, 'large.js')
    writeFileSync(script, `process.stdout.write(${JSON.stringify(payload)});`, 'utf8')

    const result = await runCliCommandSequence({
      commandName: 'qa',
      commands: [{ command: process.execPath, args: [script] }],
      summary: () => 'qa passed',
    })

    expect(readText(result.entry.logPath)).toHaveLength(payload.length)
  })
})

function readText(path: string): string {
  return readFileSync(path, 'utf8')
}
