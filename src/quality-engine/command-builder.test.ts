/**
 * Command Builder Tests
 *
 * Tests for command building functions.
 */

import { describe, expect, it } from 'vitest'

import { installManagedRunnerHermeticHooks } from '#test-helpers/managed-runner'
import {
  buildFormatCommand,
  buildLintCommand,
  buildVpTestCommand,
  buildTypecheckCommand,
  buildVitestCommand,
  commandConfigToString,
  filePathsToPackageFilters,
  getVpTestTask,
  normalizeCacInputs,
} from './command-builder'
import type { ResolvedTarget } from './target-resolver'

installManagedRunnerHermeticHooks()

function bundledVpArgs(...tail: string[]) {
  return [process.execPath, expect.stringMatching(/vite-plus.*bin.*vp/), ...tail]
}

describe('buildLintCommand', () => {
  it('builds basic lint command', () => {
    const cmd = buildLintCommand({ type: 'all', value: [] })
    expect(cmd.command).toBe('oxlint')
    expect(cmd.args).toEqual(['.'])
  })

  it('builds lint command with paths', () => {
    const cmd = buildLintCommand({ type: 'package', value: ['packages/cli2'] })
    expect(cmd.command).toBe('oxlint')
    expect(cmd.args).toEqual(['packages/cli2'])
  })

  it('builds lint command with fix flag', () => {
    const cmd = buildLintCommand({ type: 'all', value: [] }, { fix: true })
    expect(cmd.args).toContain('--fix')
  })

  it('builds lint command with fix-unsafe flag', () => {
    const cmd = buildLintCommand({ type: 'all', value: [] }, { fixUnsafe: true })
    expect(cmd.args).toContain('--fix-dangerously')
  })
})

describe('buildFormatCommand', () => {
  it('builds basic format command', () => {
    const cmd = buildFormatCommand({ type: 'all', value: [] })
    expect(cmd.command).toBe('oxfmt')
    expect(cmd.args).toEqual(['.'])
  })

  it('builds format command with paths', () => {
    const cmd = buildFormatCommand({ type: 'package', value: ['packages/cli2'] })
    expect(cmd.command).toBe('oxfmt')
    expect(cmd.args).toEqual(['packages/cli2'])
  })
})

describe('buildTypecheckCommand', () => {
  it('builds basic typecheck command', () => {
    const cmd = buildTypecheckCommand({ type: 'all', value: [] }, '/repo')
    expect(cmd.command).toBe('rtk')
    expect(cmd.args).toEqual(bundledVpArgs('run', 'typecheck'))
  })

  it('builds typecheck command with package filters', () => {
    const cmd = buildTypecheckCommand(
      { type: 'package', value: ['--filter=@webpresso/cli2'] },
      '/repo',
    )
    expect(cmd.args).toEqual(bundledVpArgs('run', '--filter=@webpresso/cli2', 'typecheck'))
  })

  it('skips package filters for non-package targets', () => {
    const cmd = buildTypecheckCommand({ type: 'file', value: ['foo.ts'] }, '/repo')
    expect(cmd.args).not.toContain('foo.ts')
  })

  it('passes native Vite+ run options through for typecheck', () => {
    const cmd = buildTypecheckCommand(
      { type: 'package', value: ['--filter=@webpresso/cli2'] },
      '/repo',
      {
        noCache: true,
        parallel: true,
        log: 'grouped',
        concurrencyLimit: 6,
      },
    )

    expect(cmd.args).toEqual(
      bundledVpArgs(
        'run',
        '--filter=@webpresso/cli2',
        '--no-cache',
        '--parallel',
        '--concurrency-limit',
        '6',
        '--log',
        'grouped',
        'typecheck',
      ),
    )
    expect(cmd.env).toEqual({ VP_RUN_CONCURRENCY_LIMIT: '6' })
  })

  it('passes --cache when cache option is set', () => {
    const cmd = buildTypecheckCommand({ type: 'all', value: [] }, '/repo', { cache: true })
    expect(cmd.args).toContain('--cache')
  })

  it('does not set env when concurrencyLimit is not set', () => {
    const cmd = buildTypecheckCommand({ type: 'all', value: [] }, '/repo', {})
    expect(cmd.env).toBeUndefined()
  })
})

describe('getVpTestTask', () => {
  it('returns test for default options', () => {
    expect(getVpTestTask({})).toBe('test')
  })

  it('returns test:watch for watch mode', () => {
    expect(getVpTestTask({ watch: true })).toBe('test:watch')
  })

  it('returns test:mutation for mutation mode', () => {
    expect(getVpTestTask({ mutation: true })).toBe('test:mutation')
  })

  it('returns test:workers for workers mode', () => {
    expect(getVpTestTask({ workers: true })).toBe('test:workers')
  })
})

describe('buildVpTestCommand', () => {
  it('builds basic workspace test command', () => {
    const cmd = buildVpTestCommand([])
    expect(cmd.command).toBe('rtk')
    expect(cmd.args).toEqual(bundledVpArgs('run', 'test'))
  })

  it('builds test command with filters', () => {
    const cmd = buildVpTestCommand(['--filter=@webpresso/cli2'])
    expect(cmd.args).toEqual(bundledVpArgs('run', '--filter=@webpresso/cli2', 'test'))
  })

  it('builds test command with coverage flag', () => {
    const cmd = buildVpTestCommand([], { coverage: true })
    expect(cmd.args).toContain('--')
    expect(cmd.args).toContain('--coverage')
  })

  it('builds test:workers command with workers flag', () => {
    const cmd = buildVpTestCommand([], { workers: true })
    expect(cmd.args.at(-1)).toBe('test:workers')
  })

  it('maps watch mode to the watch task', () => {
    const cmd = buildVpTestCommand([], { watch: true })
    expect(cmd.args).toEqual(bundledVpArgs('run', 'test:watch'))
  })

  it('passes native Vite+ run options through for tests', () => {
    const cmd = buildVpTestCommand(['--filter=@webpresso/cli2'], {
      noCache: true,
      parallel: true,
      log: 'grouped',
      concurrencyLimit: 3,
    })

    expect(cmd.args).toEqual(
      bundledVpArgs(
        'run',
        '--filter=@webpresso/cli2',
        '--no-cache',
        '--parallel',
        '--concurrency-limit',
        '3',
        '--log',
        'grouped',
        'test',
      ),
    )
    expect(cmd.env).toEqual({ VP_RUN_CONCURRENCY_LIMIT: '3' })
  })
})

describe('buildVitestCommand', () => {
  it('builds basic vitest command', () => {
    const cmd = buildVitestCommand(['foo.ts'], {})
    expect(cmd.command).toBe('vitest')
    expect(cmd.args).toContain('run')
    expect(cmd.args.some((arg) => arg.includes('foo.ts'))).toBe(true)
  })

  it('builds vitest command with watch mode', () => {
    const cmd = buildVitestCommand(['foo.ts'], { watch: true })
    expect(cmd.args).toContain('--watch')
  })

  it('does not pass --root when test files are present', () => {
    const cmd = buildVitestCommand(['foo.ts'], {}, 'packages/cli2')
    expect(cmd.args).not.toContain('--root')
    expect(cmd.args).toContain('foo.ts')
  })

  it('passes --root when only config files are provided', () => {
    const cmd = buildVitestCommand(['vitest.config.ts'], {}, 'packages/cli2')
    expect(cmd.args).toContain('--root')
    expect(cmd.args).toContain('packages/cli2')
  })

  it('treats vitest config files as --config instead of test filters', () => {
    const cmd = buildVitestCommand(['vitest.config.ts'], {})
    expect(cmd.args).toContain('--config')
    expect(cmd.args).toContain('vitest.config.ts')
    expect(cmd.args.filter((arg) => arg === 'vitest.config.ts')).toHaveLength(1)
  })

  it('supports config plus test file targets together', () => {
    const cmd = buildVitestCommand(['vitest.config.ts', 'src/foo.test.ts'], {})
    expect(cmd.args).toContain('--config')
    expect(cmd.args).toContain('vitest.config.ts')
    expect(cmd.args).toContain('src/foo.test.ts')
  })

  it('throws when multiple vitest config files are provided', () => {
    expect(() => buildVitestCommand(['vitest.config.ts', 'vitest.unit.config.ts'], {})).toThrow(
      'Expected at most one vitest config file',
    )
  })

  it('passes --root when test files array is empty', () => {
    const cmd = buildVitestCommand([], {}, 'packages/cli2')
    expect(cmd.args).toContain('--root')
    expect(cmd.args).toContain('packages/cli2')
  })

  it('passes --coverage when coverage option is set', () => {
    const cmd = buildVitestCommand(['foo.ts'], { coverage: true })
    expect(cmd.args).toContain('--coverage')
  })

  it('passes testNamePattern as -t argument', () => {
    const cmd = buildVitestCommand(['foo.ts'], { testNamePattern: 'should work' })
    expect(cmd.args).toContain('-t')
    expect(cmd.args).toContain('should work')
  })

  it('passes passthrough args', () => {
    const cmd = buildVitestCommand(['foo.ts'], { passthrough: ['--reporter=verbose'] })
    expect(cmd.args).toContain('--reporter=verbose')
  })

  it('handles vitest workspace config file', () => {
    const cmd = buildVitestCommand(['vitest.workspace.config.ts'], {})
    expect(cmd.args).toContain('--config')
    expect(cmd.args).toContain('vitest.workspace.config.ts')
  })
})

describe('buildVpTestCommand', () => {
  it('builds basic workspace test command', () => {
    const cmd = buildVpTestCommand([])
    expect(cmd.command).toBe('rtk')
    expect(cmd.args).toEqual(bundledVpArgs('run', 'test'))
  })

  it('builds test command with filters', () => {
    const cmd = buildVpTestCommand(['--filter=@webpresso/cli2'])
    expect(cmd.args).toEqual(bundledVpArgs('run', '--filter=@webpresso/cli2', 'test'))
  })

  it('builds test command with coverage flag', () => {
    const cmd = buildVpTestCommand([], { coverage: true })
    expect(cmd.args).toContain('--')
    expect(cmd.args).toContain('--coverage')
  })

  it('builds test:workers command with workers flag', () => {
    const cmd = buildVpTestCommand([], { workers: true })
    expect(cmd.args.at(-1)).toBe('test:workers')
  })

  it('maps watch mode to the watch task', () => {
    const cmd = buildVpTestCommand([], { watch: true })
    expect(cmd.args).toEqual(bundledVpArgs('run', 'test:watch'))
  })

  it('passes native Vite+ run options through for tests', () => {
    const cmd = buildVpTestCommand(['--filter=@webpresso/cli2'], {
      noCache: true,
      parallel: true,
      log: 'grouped',
      concurrencyLimit: 3,
    })

    expect(cmd.args).toEqual(
      bundledVpArgs(
        'run',
        '--filter=@webpresso/cli2',
        '--no-cache',
        '--parallel',
        '--concurrency-limit',
        '3',
        '--log',
        'grouped',
        'test',
      ),
    )
    expect(cmd.env).toEqual({ VP_RUN_CONCURRENCY_LIMIT: '3' })
  })

  it('includes testNamePattern in args', () => {
    const cmd = buildVpTestCommand(['--filter=@webpresso/cli2'], { testNamePattern: 'auth' })
    expect(cmd.args).toContain('--')
    expect(cmd.args).toContain("-t 'auth'")
  })

  it('includes json reporter args when useJsonReporter is true', () => {
    const cmd = buildVpTestCommand(['--filter=@webpresso/cli2'], {}, true)
    expect(cmd.args).toContain('--reporter=default')
    expect(cmd.args).toContain('--reporter=json')
    expect(cmd.args).toContain('--outputFile=.vite-plus/test-results.json')
  })

  it('passes passthrough options through', () => {
    const cmd = buildVpTestCommand([], { passthrough: ['--bail=1'] })
    expect(cmd.args).toContain('--')
    expect(cmd.args).toContain('--bail=1')
  })

  it('builds mutation task with mutation option', () => {
    const cmd = buildVpTestCommand([], { mutation: true })
    expect(cmd.args).toContain('test:mutation')
  })

  it('does not set env when concurrencyLimit is 0', () => {
    const cmd = buildVpTestCommand([], { concurrencyLimit: 0 })
    expect(cmd.env).toBeUndefined()
  })
})

describe('commandConfigToString', () => {
  it('joins command and args', () => {
    expect(commandConfigToString({ command: 'vp', args: ['run', 'typecheck'] })).toBe(
      'vp run typecheck',
    )
  })

  it('handles empty args', () => {
    expect(commandConfigToString({ command: 'oxlint', args: [] })).toBe('oxlint')
  })

  it('handles multiple args', () => {
    expect(
      commandConfigToString({
        command: 'vp',
        args: ['run', '--filter=@webpresso/cli2', 'test'],
      }),
    ).toBe('vp run --filter=@webpresso/cli2 test')
  })
})

describe('normalizeCacInputs', () => {
  it('normalizes string targets to array', () => {
    const result = normalizeCacInputs('single-target' as unknown as string[], {})
    expect(result.targets).toEqual(['single-target'])
  })

  it('passes array targets through', () => {
    const result = normalizeCacInputs(['a', 'b'], {})
    expect(result.targets).toEqual(['a', 'b'])
  })

  it('handles undefined targets', () => {
    const result = normalizeCacInputs(undefined, {})
    expect(result.targets).toEqual([])
  })

  it('normalizes --no-cache (cache: false) to noCache: true', () => {
    const result = normalizeCacInputs([], { cache: false })
    expect(result.options.noCache).toBe(true)
  })

  it('normalizes noCache: true directly', () => {
    const result = normalizeCacInputs([], { noCache: true })
    expect(result.options.noCache).toBe(true)
  })

  it('normalizes string package to array', () => {
    const result = normalizeCacInputs([], { package: 'cli2' })
    expect(result.options.package).toEqual(['cli2'])
  })

  it('passes array package through', () => {
    const result = normalizeCacInputs([], { package: ['cli2', 'config'] })
    expect(result.options.package).toEqual(['cli2', 'config'])
  })

  it('normalizes string file to array', () => {
    const result = normalizeCacInputs([], { file: 'foo.ts' })
    expect(result.options.file).toEqual(['foo.ts'])
  })

  it('merges positional targets into --file when both present', () => {
    const result = normalizeCacInputs(['extra.ts'], { file: ['foo.ts'] })
    expect(result.options.file).toEqual(['foo.ts', 'extra.ts'])
    expect(result.targets).toEqual([])
  })

  it('merges positional targets into --package when both present', () => {
    const result = normalizeCacInputs(['extra-pkg'], { package: ['cli2'] })
    expect(result.options.package).toEqual(['cli2', 'extra-pkg'])
    expect(result.targets).toEqual([])
  })

  it('prefers --file merge over --package when both present', () => {
    const result = normalizeCacInputs(['extra'], { file: ['foo.ts'], package: ['cli2'] })
    expect(result.options.file).toEqual(['foo.ts', 'extra'])
    // Package unchanged since targets were consumed by file
    expect(result.options.package).toEqual(['cli2'])
    expect(result.targets).toEqual([])
  })

  it('leaves package/file undefined when not provided', () => {
    const result = normalizeCacInputs([], {})
    expect(result.options.package).toBe(undefined)
    expect(result.options.file).toBe(undefined)
  })
})

describe('filePathsToPackageFilters', () => {
  const mockResolve: (target: string, deps: { repoRoot: string }) => ResolvedTarget = (target) => ({
    type: 'package',
    value: [`--filter=@webpresso/${target.replace(/^packages\//, '').replace(/\//g, '-')}`],
  })

  it('converts file paths to package filters', () => {
    const filters = filePathsToPackageFilters(
      ['packages/sdk/config/src/index.ts'],
      '/repo',
      mockResolve,
    )
    expect(filters).toContain('--filter=@webpresso/sdk-config')
  })

  it('returns empty array for paths outside packages', () => {
    const filters = filePathsToPackageFilters(['unknown/path/file.ts'], '/repo', mockResolve)
    expect(filters).toEqual([])
  })

  it('deduplicates filters for files in same package', () => {
    const filters = filePathsToPackageFilters(
      ['packages/sdk/config/src/index.ts', 'packages/sdk/config/src/utils.ts'],
      '/repo',
      mockResolve,
    )
    const uniqueFilters = new Set(filters)
    expect(uniqueFilters.size).toBe(filters.length)
    expect(filters.length).toBe(1)
  })
})
