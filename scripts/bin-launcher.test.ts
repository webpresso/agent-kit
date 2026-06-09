import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  BIN_ENTRYPOINTS,
  buildLaunchPlan,
  resolveInvokedBinName,
  resolvePinnedNodeVersion,
} from '../bin/_run.js'
import {
  COMMAND_LANE_TABLE,
  JS_HOLDBACK_LANE,
  PHASE2_RUNTIME_LANE,
  RUNTIME_LANE,
  getWpCommandLane,
} from '../bin/runtime-lanes.js'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const RUNTIME_MANIFEST = {
  binaryName: 'wp',
  targets: [
    {
      id: 'linux-x64',
      bunTarget: 'bun-linux-x64',
      os: 'linux',
      cpu: 'x64',
      packageName: '@webpresso/agent-kit-runtime-linux-x64',
    },
  ],
}

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

  it('routes phase-1 wp runtime-lane commands through the compiled runtime when present', () => {
    for (const forwardedArgs of [
      ['mcp'],
      ['hook', 'pretool-guard'],
      ['hooks', 'doctor'],
      ['hooks', '--skip-mcp'],
      ['hooks', '--vendor', 'codex', 'status'],
      ['hooks', 'dispatch', 'Stop', '--vendor', 'codex'],
    ]) {
      const plan = buildLaunchPlan({
        binName: 'wp',
        repoRoot: '/repo',
        forwardedArgs,
        platform: 'linux',
        arch: 'x64',
        runtimeManifest: RUNTIME_MANIFEST,
        runtimeBinaryExists: (path) => path === '/repo/bin/runtime/linux-x64/wp',
        builtExists: true,
        sourceExists: true,
        nodeExecPath: '/usr/bin/node',
        currentNodeVersion: 'v24.16.0',
        pinnedNodeVersion: '24.16.0',
        runtimeManager: null,
      })

      expect(plan.mode).toBe('runtime')
      expect(plan.runtime).toBe('/repo/bin/runtime/linux-x64/wp')
      expect(plan.args).toEqual(forwardedArgs)
    }
  })

  it('routes wp mcp through the compiled runtime when the host runtime package is present', () => {
    const plan = buildLaunchPlan({
      binName: 'wp',
      repoRoot: '/repo',
      forwardedArgs: ['mcp'],
      platform: 'linux',
      arch: 'x64',
      runtimeManifest: RUNTIME_MANIFEST,
      runtimeBinaryExists: (path) => path === '/repo/bin/runtime/linux-x64/wp',
      builtExists: true,
      sourceExists: true,
      nodeExecPath: '/usr/bin/node',
      currentNodeVersion: 'v24.16.0',
      pinnedNodeVersion: '24.16.0',
      runtimeManager: null,
    })

    expect(plan.mode).toBe('runtime')
    expect(plan.runtime).toBe('/repo/bin/runtime/linux-x64/wp')
    expect(plan.args).toEqual(['mcp'])
  })

  it('keeps wp setup on the built JS launcher even when the host runtime package is present', () => {
    expect(
      buildLaunchPlan({
        binName: 'wp',
        repoRoot: '/repo',
        forwardedArgs: ['setup', '--yes'],
        platform: 'linux',
        arch: 'x64',
        runtimeManifest: RUNTIME_MANIFEST,
        runtimeBinaryExists: () => true,
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
      args: ['/repo/dist/esm/cli/cli.js', 'setup', '--yes'],
      entrypoint: '/repo/dist/esm/cli/cli.js',
    })
  })

  it('keeps hooks holdback subcommands on JS/Bun rather than the runtime lane', () => {
    expect(getWpCommandLane(['hooks', 'demo', 'PreToolUse'])).toBe(JS_HOLDBACK_LANE)
    expect(getWpCommandLane(['hooks', 'upgrade', '--workspace'])).toBe(JS_HOLDBACK_LANE)
  })

  it('prefers staged compiled runtime artifacts for runtime-owned hook bins', () => {
    const plan = buildLaunchPlan({
      binName: 'wp-pretool-guard',
      repoRoot: '/repo',
      forwardedArgs: ['--verbose'],
      platform: 'linux',
      arch: 'x64',
      runtimeManifest: RUNTIME_MANIFEST,
      runtimeBinaryExists: (path) => path === '/repo/bin/runtime/linux-x64/wp',
      builtExists: true,
      sourceExists: true,
      nodeExecPath: '/usr/bin/node',
      currentNodeVersion: 'v24.16.0',
      pinnedNodeVersion: '24.16.0',
      runtimeManager: null,
    })

    expect(plan.mode).toBe('runtime')
    expect(plan.runtime).toBe('/repo/bin/runtime/linux-x64/wp')
    expect(plan.entrypoint).toBe('/repo/bin/runtime/linux-x64/wp')
    expect(plan.args).toEqual(['hook', 'pretool-guard', '--verbose'])
    expect(plan.env).toMatchObject({
      WP_COMPILED_RUNTIME: '1',
      WP_MCP_TOOL_MODE: 'registry',
    })
  })

  it('does not route docs bins through the compiled runtime selector', () => {
    expect(
      buildLaunchPlan({
        binName: 'docs-lint',
        repoRoot: '/repo',
        forwardedArgs: ['README.md'],
        platform: 'linux',
        arch: 'x64',
        runtimeManifest: RUNTIME_MANIFEST,
        runtimeBinaryExists: () => true,
        builtExists: true,
        sourceExists: true,
        sourceNeedsSourceLaunch: false,
        nodeExecPath: '/usr/bin/node',
        currentNodeVersion: 'v24.16.0',
        pinnedNodeVersion: '24.16.0',
        runtimeManager: null,
      }).mode,
    ).toBe('built')
  })

  it('keeps source-checkout fallback when a compiled runtime artifact is not present', () => {
    expect(
      buildLaunchPlan({
        binName: 'wp-stop-qa',
        repoRoot: '/repo',
        forwardedArgs: [],
        platform: 'linux',
        arch: 'x64',
        runtimeManifest: RUNTIME_MANIFEST,
        runtimeBinaryExists: () => false,
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
      args: ['/repo/src/hooks/stop/qa-changed-files.ts'],
      entrypoint: '/repo/src/hooks/stop/qa-changed-files.ts',
    })
  })

  it('fails clearly when a caller explicitly requires an unavailable compiled runtime', () => {
    expect(() =>
      buildLaunchPlan({
        binName: 'wp',
        repoRoot: '/repo',
        forwardedArgs: [],
        platform: 'freebsd',
        arch: 'x64',
        runtimeManifest: RUNTIME_MANIFEST,
        runtimeBinaryExists: () => false,
        forceCompiledRuntime: true,
        builtExists: true,
        sourceExists: true,
        nodeExecPath: '/usr/bin/node',
        currentNodeVersion: 'v24.16.0',
        pinnedNodeVersion: '24.16.0',
        runtimeManager: null,
      }),
    ).toThrow(/unsupported platform\/arch target freebsd\/x64/)
  })

  it('hard-fails migrated runtime-lane commands in published installs when optional runtime is omitted', () => {
    expect(() =>
      buildLaunchPlan({
        binName: 'wp',
        repoRoot: '/repo',
        forwardedArgs: ['hooks', 'status'],
        platform: 'linux',
        arch: 'x64',
        runtimeManifest: RUNTIME_MANIFEST,
        runtimeBinaryExists: () => false,
        builtExists: true,
        sourceExists: false,
        nodeExecPath: '/usr/bin/node',
        currentNodeVersion: 'v24.16.0',
        pinnedNodeVersion: '24.16.0',
        runtimeManager: null,
      }),
    ).toThrow(/--omit=optional/)
  })

  it('hard-fails runtime-owned direct hook bins in published installs when runtime is missing', () => {
    expect(() =>
      buildLaunchPlan({
        binName: 'wp-pretool-guard',
        repoRoot: '/repo',
        forwardedArgs: [],
        platform: 'linux',
        arch: 'x64',
        runtimeManifest: RUNTIME_MANIFEST,
        runtimeBinaryExists: () => false,
        builtExists: true,
        sourceExists: false,
        nodeExecPath: '/usr/bin/node',
        currentNodeVersion: 'v24.16.0',
        pinnedNodeVersion: '24.16.0',
        runtimeManager: null,
      }),
    ).toThrow(/required platform runtime @webpresso\/agent-kit-runtime-linux-x64/)
  })

  it('classifies the canonical command-lane table', () => {
    expect(COMMAND_LANE_TABLE.runtimeRequired.wpCommands).toContain('mcp')
    expect(COMMAND_LANE_TABLE.runtimeRequired.wpCommands).toContain('hook')
    expect(COMMAND_LANE_TABLE.runtimeRequired.hooksSubcommands).toEqual([
      'doctor',
      'status',
      'dispatch',
    ])
    expect(COMMAND_LANE_TABLE.runtimeRequired.directBins).toEqual([
      'wp-pretool-guard',
      'wp-post-tool',
      'wp-stop-qa',
      'wp-guard-switch',
      'wp-sessionstart-routing',
      'wp-test-quality-check',
      'wp-check-dev-link',
    ])
    expect(getWpCommandLane(['mcp'])).toBe(RUNTIME_LANE)
    expect(getWpCommandLane(['test'])).toBe(PHASE2_RUNTIME_LANE)
    expect(getWpCommandLane(['setup'])).toBe(JS_HOLDBACK_LANE)
  })

  it('prefers source for wp when the cli tree requires a source launch', () => {
    expect(
      buildLaunchPlan({
        binName: 'wp',
        repoRoot: '/repo',
        forwardedArgs: ['bench', 'session-memory', '--dry-run'],
        builtExists: true,
        sourceExists: true,
        sourceNeedsSourceLaunch: true,
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

  it('keeps latency-sensitive hook bins on built dist even when source is newer', () => {
    expect(
      buildLaunchPlan({
        binName: 'wp-guard-switch',
        repoRoot: '/repo',
        forwardedArgs: [],
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
      mode: 'built',
      runtime: '/usr/bin/node',
      args: ['/repo/dist/esm/hooks/guard-switch/index.js'],
      entrypoint: '/repo/dist/esm/hooks/guard-switch/index.js',
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
    expect(resolvePinnedNodeVersion(REPO_ROOT)).toBe('24.16.0')
  })
})
