import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveLocalPackageEntrypoint, resolveNodeRuntimeCommand } from '#tool-runtime/local-package-entrypoint.js'

const runCommand = vi.hoisted(() => vi.fn())

vi.mock('#mcp/tools/_shared/run-command', () => ({
  isRunFailure: () => false,
  runCommand,
}))

import { runTypecheck } from './index.js'

describe('runTypecheck', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    runCommand.mockReset()
    while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true })
  })

  it('routes root typecheck through managed vp exec tsc', async () => {
    const tscEntrypoint = resolveLocalPackageEntrypoint(process.cwd(), 'typescript', 'bin/tsc')
    runCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      aborted: false,
    })

    await runTypecheck({ cwd: process.cwd() })

    expect(runCommand).toHaveBeenCalledWith(
      resolveNodeRuntimeCommand(),
      [tscEntrypoint!, '--noEmit', '--pretty', 'false'],
      expect.objectContaining({ cwd: process.cwd() }),
    )
  })

  it('fans out across workspace packages when the root has no local TypeScript runtime', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wp-typecheck-workspace-'))
    tempDirs.push(cwd)

    writeFileSync(join(cwd, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n", 'utf8')
    mkdirSync(join(cwd, 'packages', 'a'), { recursive: true })
    mkdirSync(join(cwd, 'packages', 'b'), { recursive: true })
    writeFileSync(join(cwd, 'packages', 'a', 'package.json'), JSON.stringify({ name: 'a' }), 'utf8')
    writeFileSync(join(cwd, 'packages', 'a', 'tsconfig.json'), '{}', 'utf8')
    writeFileSync(join(cwd, 'packages', 'b', 'package.json'), JSON.stringify({ name: 'b' }), 'utf8')
    writeFileSync(join(cwd, 'packages', 'b', 'tsconfig.json'), '{}', 'utf8')

    runCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      aborted: false,
    })

    await runTypecheck({ cwd, pretty: false })

    expect(runCommand).toHaveBeenCalledTimes(2)
    const [, args0, options0] = runCommand.mock.calls[0]!
    const [, args1, options1] = runCommand.mock.calls[1]!
    expect(args0.slice(-5)).toEqual(['--noEmit', '-p', 'tsconfig.json', '--pretty', 'false'])
    expect(args1.slice(-5)).toEqual(['--noEmit', '-p', 'tsconfig.json', '--pretty', 'false'])
    expect(options0).toMatchObject({ cwd: join(cwd, 'packages', 'a') })
    expect(options1).toMatchObject({ cwd: join(cwd, 'packages', 'b') })
  })
})
