import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BIN_ENTRYPOINTS,
  buildLaunchPlan,
  resolveInvokedBinName,
  resolvePinnedNodeVersion,
} from '../bin/_run.js'
import {
  COMMAND_LANE_TABLE,
  JS_HOLDBACK_LANE,
  JS_HOLDBACK_WP_COMMANDS,
  PHASE2_RUNTIME_LANE,
  PHASE2_RUNTIME_WP_COMMANDS,
  RUNTIME_LANE,
  formatCommandLaneSummary,
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

beforeEach(() => {
  vi.stubEnv('WP_FORCE_SOURCE', '0')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

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

  it('routes every Phase 2 quality command through the compiled runtime when present', () => {
    for (const command of PHASE2_RUNTIME_WP_COMMANDS) {
      const plan = buildLaunchPlan({
        binName: 'wp',
        repoRoot: '/repo',
        forwardedArgs: [command, '--help'],
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

      expect(plan.mode, command).toBe('runtime')
      expect(plan.runtime, command).toBe('/repo/bin/runtime/linux-x64/wp')
      expect(plan.args, command).toEqual([command, '--help'])
    }
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

  it('keeps representative JS/Bun holdback commands on the built launcher when runtime is present', () => {
    for (const command of JS_HOLDBACK_WP_COMMANDS.filter((value) =>
      ['setup', 'sync', 'blueprint', 'compile', 'skill', 'install', 'run'].includes(value),
    )) {
      const plan = buildLaunchPlan({
        binName: 'wp',
        repoRoot: '/repo',
        forwardedArgs: [command, '--help'],
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
      })

      expect(plan.mode, command).toBe('built')
      expect(plan.args, command).toEqual(['/repo/dist/esm/cli/cli.js', command, '--help'])
    }
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
    for (const forwardedArgs of [
      ['hooks', 'status'],
      ...PHASE2_RUNTIME_WP_COMMANDS.map((command) => [command]),
    ]) {
      expect(
        () =>
          buildLaunchPlan({
            binName: 'wp',
            repoRoot: '/repo',
            forwardedArgs,
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
        forwardedArgs.join(' '),
      ).toThrow(/--omit=optional/)
    }
  })

  it('fails migrated published commands clearly when the runtime manifest is missing', () => {
    expect(() =>
      buildLaunchPlan({
        binName: 'wp',
        repoRoot: '/repo',
        forwardedArgs: ['doctor'],
        platform: 'linux',
        arch: 'x64',
        builtExists: true,
        sourceExists: false,
        nodeExecPath: '/usr/bin/node',
        currentNodeVersion: 'v24.16.0',
        pinnedNodeVersion: '24.16.0',
        runtimeManager: null,
      }),
    ).toThrow(/required compiled runtime manifest is missing/)
  })

  it('fails migrated published commands clearly on unsupported platform and architecture', () => {
    expect(() =>
      buildLaunchPlan({
        binName: 'wp',
        repoRoot: '/repo',
        forwardedArgs: ['qa'],
        platform: 'freebsd',
        arch: 'riscv64',
        runtimeManifest: RUNTIME_MANIFEST,
        runtimeBinaryExists: () => false,
        builtExists: true,
        sourceExists: false,
        nodeExecPath: '/usr/bin/node',
        currentNodeVersion: 'v24.16.0',
        pinnedNodeVersion: '24.16.0',
        runtimeManager: null,
      }),
    ).toThrow(/unsupported platform\/arch target freebsd\/riscv64/)
  })

  it('reports optional dependency wiring when the runtime binary is missing or corrupt', () => {
    const packageRoot = mkdtempSync(join(tmpdir(), 'wp-launcher-package-'))
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify({
        optionalDependencies: {
          '@webpresso/agent-kit-runtime-linux-x64': '0.29.3',
        },
      }),
      'utf8',
    )

    expect(() =>
      buildLaunchPlan({
        binName: 'wp',
        repoRoot: packageRoot,
        forwardedArgs: ['lint'],
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
    ).toThrow(
      /optional dependency wiring declares @webpresso\/agent-kit-runtime-linux-x64@0\.29\.3/,
    )
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
      'wp-precompact-snapshot',
      'wp-test-quality-check',
    ])
    expect(getWpCommandLane(['mcp'])).toBe(RUNTIME_LANE)
    for (const command of PHASE2_RUNTIME_WP_COMMANDS) {
      expect(getWpCommandLane([command]), command).toBe(PHASE2_RUNTIME_LANE)
    }
    expect(getWpCommandLane(['setup'])).toBe(JS_HOLDBACK_LANE)
    expect(formatCommandLaneSummary()).toBe(
      'runtime-required, phase2-runtime, and JS/Bun holdback lanes',
    )
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

describe('WP_FORCE_SOURCE sourceOverride', () => {
  it('routes phase2-runtime wp commands to source when sourceOverride is true', () => {
    const plan = buildLaunchPlan({
      binName: 'wp',
      repoRoot: '/repo',
      forwardedArgs: ['audit', 'package-surface'],
      sourceOverride: true,
      sourceExists: true,
      builtExists: false,
      nodeExecPath: '/usr/bin/node',
      currentNodeVersion: 'v24.16.0',
      pinnedNodeVersion: '24.16.0',
      runtimeManager: null,
      platform: 'linux',
      arch: 'x64',
      runtimeManifest: RUNTIME_MANIFEST,
      runtimeBinaryExists: () => true,
      runtimeBinaryPath: '/repo/bin/runtime/linux-x64/wp',
    })
    expect(plan).toStrictEqual({
      mode: 'source',
      runtime: 'bun',
      entrypoint: '/repo/src/cli/cli.ts',
      args: ['/repo/src/cli/cli.ts', 'audit', 'package-surface'],
    })
  })

  it('does not override the runtime plan when sourceOverride is false', () => {
    const plan = buildLaunchPlan({
      binName: 'wp',
      repoRoot: '/repo',
      forwardedArgs: ['audit', 'package-surface'],
      sourceOverride: false,
      sourceExists: true,
      builtExists: false,
      nodeExecPath: '/usr/bin/node',
      currentNodeVersion: 'v24.16.0',
      pinnedNodeVersion: '24.16.0',
      runtimeManager: null,
      platform: 'linux',
      arch: 'x64',
      runtimeManifest: RUNTIME_MANIFEST,
      runtimeBinaryExists: () => true,
      runtimeBinaryPath: '/repo/bin/runtime/linux-x64/wp',
    })
    expect(plan.mode).toStrictEqual('runtime')
  })

  it('is a no-op when source does not exist (consumer install without src/)', () => {
    const plan = buildLaunchPlan({
      binName: 'wp',
      repoRoot: '/repo',
      forwardedArgs: ['audit', 'package-surface'],
      sourceOverride: true,
      sourceExists: false,
      builtExists: false,
      nodeExecPath: '/usr/bin/node',
      currentNodeVersion: 'v24.16.0',
      pinnedNodeVersion: '24.16.0',
      runtimeManager: null,
      platform: 'linux',
      arch: 'x64',
      runtimeManifest: RUNTIME_MANIFEST,
      runtimeBinaryExists: () => true,
      runtimeBinaryPath: '/repo/bin/runtime/linux-x64/wp',
    })
    expect(plan.mode).toStrictEqual('runtime')
  })

  it('keeps latency-sensitive hook bins on compiled binary even with sourceOverride (F1)', () => {
    const plan = buildLaunchPlan({
      binName: 'wp-pretool-guard',
      repoRoot: '/repo',
      forwardedArgs: [],
      sourceOverride: true,
      sourceExists: true,
      builtExists: false,
      nodeExecPath: '/usr/bin/node',
      currentNodeVersion: 'v24.16.0',
      pinnedNodeVersion: '24.16.0',
      runtimeManager: null,
      platform: 'linux',
      arch: 'x64',
      runtimeManifest: RUNTIME_MANIFEST,
      runtimeBinaryExists: () => true,
      runtimeBinaryPath: '/repo/bin/runtime/linux-x64/wp',
    })
    expect(plan.mode).toStrictEqual('runtime')
  })
})
