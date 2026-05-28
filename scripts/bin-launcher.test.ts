import { describe, expect, it } from 'vitest'

import {
  BIN_ENTRYPOINTS,
  buildLaunchPlan,
  resolveInvokedBinName,
  resolvePinnedNodeVersion,
} from '../bin/_run.js'

describe('bin launcher', () => {
  it('maps known public bin names to source entrypoints', () => {
    expect(BIN_ENTRYPOINTS.wp).toBe('src/cli/cli.ts')
    expect(BIN_ENTRYPOINTS['wp-pretool-guard']).toBe('src/hooks/pretool-guard/index.ts')
    expect(BIN_ENTRYPOINTS['docs-lint']).toBe('src/config/docs-lint/cli/validate.ts')
  })

  it('prefers built dist entrypoints when available', () => {
    expect(
      buildLaunchPlan({
        binName: 'wp',
        repoRoot: '/repo',
        forwardedArgs: ['mcp'],
        builtExists: true,
        sourceExists: true,
        nodeExecPath: '/usr/bin/node',
        currentNodeVersion: 'v24.16.0',
        pinnedNodeVersion: '24.16.0',
        runtimeManager: null,
      }),
    ).toEqual({
      mode: 'built',
      runtime: '/usr/bin/node',
      args: ['/repo/dist/esm/cli/cli.js', 'mcp'],
      entrypoint: '/repo/dist/esm/cli/cli.js',
    })
  })

  it('prefers source when the source checkout is newer than the built entrypoint', () => {
    expect(
      buildLaunchPlan({
        binName: 'wp',
        repoRoot: '/repo',
        forwardedArgs: ['bench', 'session-memory', '--dry-run'],
        builtExists: true,
        sourceExists: true,
        builtMtimeMs: 100,
        sourceMtimeMs: 200,
        nodeExecPath: '/usr/bin/node',
        currentNodeVersion: 'v24.16.0',
        pinnedNodeVersion: '24.16.0',
        runtimeManager: null,
      }),
    ).toEqual({
      mode: 'source',
      runtime: 'bun',
      args: ['/repo/src/cli/cli.ts', 'bench', 'session-memory', '--dry-run'],
      entrypoint: '/repo/src/cli/cli.ts',
    })
  })

  it('re-execs through mise when the built package pins a different exact Node version', () => {
    expect(
      buildLaunchPlan({
        binName: 'wp',
        repoRoot: '/repo',
        forwardedArgs: ['blueprint', 'audit'],
        builtExists: true,
        sourceExists: true,
        nodeExecPath: '/usr/bin/node',
        currentNodeVersion: 'v25.9.0',
        pinnedNodeVersion: '24.16.0',
        runtimeManager: { kind: 'mise', command: 'mise' },
      }),
    ).toEqual({
      mode: 'built',
      runtime: 'mise',
      args: [
        'exec',
        'node@24.16.0',
        '--',
        '/usr/bin/node',
        '/repo/dist/esm/cli/cli.js',
        'blueprint',
        'audit',
      ],
      entrypoint: '/repo/dist/esm/cli/cli.js',
    })
  })

  it('fails clearly when the built package pins a different exact Node version and no manager is available', () => {
    expect(() =>
      buildLaunchPlan({
        binName: 'wp',
        repoRoot: '/repo',
        forwardedArgs: [],
        builtExists: true,
        sourceExists: true,
        nodeExecPath: '/usr/bin/node',
        currentNodeVersion: 'v25.9.0',
        pinnedNodeVersion: '24.16.0',
        runtimeManager: null,
      }),
    ).toThrow(/pins Node 24\.16\.0/)
  })

  it('falls back to bun + source in a source checkout when dist is absent', () => {
    expect(
      buildLaunchPlan({
        binName: 'wp-check-dev-link',
        repoRoot: '/repo',
        forwardedArgs: [],
        builtExists: false,
        sourceExists: true,
        nodeExecPath: '/usr/bin/node',
        currentNodeVersion: 'v24.16.0',
        pinnedNodeVersion: '24.16.0',
        runtimeManager: null,
      }),
    ).toEqual({
      mode: 'source',
      runtime: 'bun',
      args: ['/repo/src/hooks/check-dev-link/index.ts'],
      entrypoint: '/repo/src/hooks/check-dev-link/index.ts',
    })
  })

  it('throws a repair-oriented error when neither dist nor source exists', () => {
    expect(() =>
      buildLaunchPlan({
        binName: 'wp',
        repoRoot: '/repo',
        forwardedArgs: [],
        builtExists: false,
        sourceExists: false,
        nodeExecPath: '/usr/bin/node',
        currentNodeVersion: 'v24.16.0',
        pinnedNodeVersion: '24.16.0',
        runtimeManager: null,
      }),
    ).toThrow(/wp hooks doctor/)
  })

  it('resolves the invoked bin name from the executable basename', () => {
    expect(resolveInvokedBinName(['/repo/node_modules/.bin/wp-pretool-guard'])).toBe(
      'wp-pretool-guard',
    )
    expect(resolveInvokedBinName(['/repo/bin/wp-sessionstart-routing.js'])).toBe(
      'wp-sessionstart-routing',
    )
  })

  it('reads the pinned exact Node version from package metadata when present', () => {
    expect(resolvePinnedNodeVersion('/Users/ozby/repos/webpresso/agent-kit')).toBe('24.16.0')
  })
})
