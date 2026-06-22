import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

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
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  function write(path: string, content: string): void {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf8')
  }

  function createWorkspace() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'wp-run-typecheck-')))
    tempDirs.push(root)
    write(
      join(root, 'package.json'),
      JSON.stringify({ name: '@webpresso/agent-kit', private: true }),
    )
    write(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    write(join(root, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}\n')
    write(
      join(root, 'packages/foo/package.json'),
      JSON.stringify({ name: '@scope/foo', private: true }),
    )
    write(join(root, 'packages/foo/tsconfig.json'), '{"compilerOptions":{"strict":true}}\n')
    write(join(root, 'packages/foo/src/foo.ts'), 'export const foo = 1\n')
    write(join(root, 'src/root.ts'), 'export const rootValue = 1\n')
    return root
  }

  it('routes root typecheck through the managed TypeScript runner', async () => {
    runCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      aborted: false,
    })

    await runTypecheck({ cwd: process.cwd() })

    expect(runCommand).toHaveBeenCalledTimes(1)
    const [cmd, args, opts] = runCommand.mock.calls[0]!
    expect([cmd, ...args].join(' ')).toContain('typescript')
    expect(args).toEqual(expect.arrayContaining(['--noEmit', '--pretty', 'false']))
    expect(opts).toEqual(expect.objectContaining({ cwd: process.cwd() }))
  })

  it('resolves file targets to owning scopes and runs each scope once', async () => {
    const root = createWorkspace()
    runCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      aborted: false,
    })

    await runTypecheck({
      cwd: root,
      files: ['src/root.ts', 'packages/foo/src/foo.ts', 'packages/foo/src/foo.ts'],
    })

    expect(runCommand).toHaveBeenCalledTimes(2)
    expect(runCommand.mock.calls.map((call) => call[2]?.cwd)).toEqual([
      root,
      join(root, 'packages/foo'),
    ])
  })

  it('resolves exact package targets and still works for packages', async () => {
    const root = createWorkspace()
    runCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      aborted: false,
    })

    await runTypecheck({ cwd: root, packages: ['@scope/foo'] })

    expect(runCommand).toHaveBeenCalledTimes(1)
    expect(runCommand.mock.calls[0]?.[2]?.cwd).toBe(join(root, 'packages/foo'))
  })

  it('rejects files and packages together', async () => {
    await expect(
      runTypecheck({
        cwd: process.cwd(),
        files: ['src/index.ts'],
        packages: ['@scope/foo'],
      }),
    ).rejects.toThrow(/Cannot use both files and packages/i)
  })
})
