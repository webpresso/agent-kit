import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ChangedFilesResult } from '#git/changed-files'

const qualityRunnerMocks = vi.hoisted(() => ({
  runCliCommandSequence: vi.fn(async () => ({
    exitCode: 0,
    timedOut: false,
    aborted: false,
    entry: {
      id: 'format-log',
      command: 'format',
      timestamp: '2026-06-22T00:00:00.000Z',
      exitCode: 0,
      logPath: '/tmp/format-log',
      summary: 'format applied',
    },
  })),
  emitCliCommandOutput: vi.fn(),
}))

vi.mock('./quality-runner.js', () => qualityRunnerMocks)

import { buildFormatCommand, FORMAT_COMMAND_HELP, registerFormatCommand } from './format.js'

function buildFakeCli() {
  const options: string[] = []
  let capturedAction: ((flags: Record<string, unknown>) => unknown) | undefined
  const chain = {
    option: (name: string) => {
      options.push(name)
      return chain
    },
    action: (fn: typeof capturedAction) => {
      capturedAction = fn
      return chain
    },
  }
  return {
    command: () => chain,
    getOptions: () => options,
    getAction: () => capturedAction,
  }
}

function ok(files: string[]): ChangedFilesResult {
  return { files, degraded: false, reason: files.length === 0 ? 'empty' : 'ok' }
}

afterEach(() => {
  qualityRunnerMocks.runCliCommandSequence.mockClear()
  qualityRunnerMocks.emitCliCommandOutput.mockClear()
  vi.restoreAllMocks()
})

describe('wp format command', () => {
  it('builds the formatter command with the repo-owned ignore-path contract', () => {
    const command = buildFormatCommand({ files: ['src/index.ts'] })
    expect(command.command).toBeTruthy()
    expect(command.command).toEqual(expect.stringMatching(/oxfmt/))
    expect(command.args).toEqual(
      expect.arrayContaining(['--write', '--ignore-path', '.gitignore', 'src/index.ts']),
    )
  })

  it('exposes affected-target options alongside the summary-first --full escape hatch', () => {
    const cli = buildFakeCli()
    registerFormatCommand(cli as never)
    expect(cli.getOptions()).toContain('--file <path>')
    expect(cli.getOptions()).toContain('--affected')
    expect(cli.getOptions()).toContain('--branch')
    expect(cli.getOptions()).toContain('--full')
  })

  it('documents the standardized --affected syntax', () => {
    expect(FORMAT_COMMAND_HELP).toContain('wp format --affected')
    expect(FORMAT_COMMAND_HELP).toContain('git add first')
  })

  it('errors when --branch is provided without --affected', async () => {
    const cli = buildFakeCli()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerFormatCommand(cli as never)

    await expect(cli.getAction()?.({ branch: true })).resolves.toBe(1)
    expect(error).toHaveBeenCalledWith('--branch requires --affected')
    expect(qualityRunnerMocks.runCliCommandSequence).not.toHaveBeenCalled()
  })

  it('errors when --affected and --file are combined', async () => {
    const cli = buildFakeCli()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerFormatCommand(cli as never)

    await expect(cli.getAction()?.({ affected: true, file: 'src/index.ts' })).resolves.toBe(1)
    expect(error).toHaveBeenCalledWith('Cannot use --affected and --file together.')
    expect(qualityRunnerMocks.runCliCommandSequence).not.toHaveBeenCalled()
  })

  it('uses staged formatable files for --affected', async () => {
    const cli = buildFakeCli()
    registerFormatCommand(cli as never, {
      getStagedFiles: () => ok(['src/index.ts', 'README.txt', 'README.md']),
    })

    await expect(cli.getAction()?.({ affected: true })).resolves.toBe(0)
    expect(qualityRunnerMocks.runCliCommandSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataOptions: expect.objectContaining({ files: ['src/index.ts', 'README.md'] }),
        commands: [
          expect.objectContaining({
            args: expect.arrayContaining(['src/index.ts', 'README.md']),
          }),
        ],
      }),
    )
  })

  it('uses branch-changed formatable files for --affected --branch', async () => {
    const cli = buildFakeCli()
    registerFormatCommand(cli as never, {
      getBranchChangedFiles: () => ok(['src/cli/commands/format.test.ts']),
    })

    await expect(cli.getAction()?.({ affected: true, branch: true })).resolves.toBe(0)
    expect(qualityRunnerMocks.runCliCommandSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataOptions: expect.objectContaining({ affected: true, branch: true }),
      }),
    )
  })

  it('keeps repo-root-relative affected files when invoked from a subdirectory', async () => {
    const cli = buildFakeCli()
    const repoCwd = process.cwd()
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(path.join(repoCwd, 'src'))
    registerFormatCommand(cli as never, {
      getStagedFiles: () => ok(['src/cli/commands/format.test.ts']),
    })

    await expect(cli.getAction()?.({ affected: true })).resolves.toBe(0)
    expect(qualityRunnerMocks.runCliCommandSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: repoCwd,
        metadataOptions: expect.objectContaining({ files: ['src/cli/commands/format.test.ts'] }),
      }),
    )
    cwdSpy.mockRestore()
  })

  it('skips quickly when no staged formatable files remain after filtering', async () => {
    const cli = buildFakeCli()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    registerFormatCommand(cli as never, {
      getStagedFiles: () => ok(['README.txt']),
    })

    await expect(cli.getAction()?.({ affected: true })).resolves.toBe(0)
    expect(log).toHaveBeenCalledWith('No staged affected formatable files — skipping format.')
    expect(qualityRunnerMocks.runCliCommandSequence).not.toHaveBeenCalled()
  })

  it('falls back to whole-repo format --check on degraded affected resolution', async () => {
    const cli = buildFakeCli()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerFormatCommand(cli as never, {
      getStagedFiles: () => ({ files: [], degraded: true, reason: 'missing-base-ref' }),
    })

    await expect(cli.getAction()?.({ affected: true, check: true })).resolves.toBe(0)
    expect(error).toHaveBeenCalledWith(
      'Unable to determine affected files for format --check (missing-base-ref); falling back to a whole-repo format check.',
    )
    expect(qualityRunnerMocks.runCliCommandSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: [expect.objectContaining({ args: expect.arrayContaining(['--check']) })],
      }),
    )
  })

  it('fails closed for degraded write-mode --affected runs', async () => {
    const cli = buildFakeCli()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerFormatCommand(cli as never, {
      getStagedFiles: () => ({ files: [], degraded: true, reason: 'git-error' }),
    })

    await expect(cli.getAction()?.({ affected: true })).resolves.toBe(1)
    expect(error).toHaveBeenCalledWith(
      'Unable to determine affected files for format (git-error); refusing a degraded whole-repo write. Rerun without --affected, pass --check, or target files explicitly.',
    )
    expect(qualityRunnerMocks.runCliCommandSequence).not.toHaveBeenCalled()
  })
})
