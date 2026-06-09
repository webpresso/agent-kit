import { describe, expect, it } from 'vitest'

import { buildLaunchPlan } from './_run.js'

describe('buildLaunchPlan', () => {
  it('prefers wp source when any CLI runtime source file is newer than dist', () => {
    const plan = buildLaunchPlan({
      binName: 'wp',
      repoRoot: '/repo',
      forwardedArgs: ['hooks', 'status', '--vendor', 'codex'],
      builtExists: true,
      sourceExists: true,
      sourceNeedsSourceLaunch: true,
      pinnedNodeVersion: null,
      runtimeManager: null,
    })

    expect(plan).toMatchObject({
      mode: 'source',
      entrypoint: '/repo/src/cli/cli.ts',
      args: ['/repo/src/cli/cli.ts', 'hooks', 'status', '--vendor', 'codex'],
    })
  })

  it('preserves source-checkout fallback for migrated runtime commands when runtime is unstaged', () => {
    const plan = buildLaunchPlan({
      binName: 'wp',
      repoRoot: '/repo',
      forwardedArgs: ['hooks', 'doctor', '--skip-mcp'],
      platform: 'linux',
      arch: 'x64',
      runtimeManifest: {
        binaryName: 'wp',
        targets: [
          {
            id: 'linux-x64',
            os: 'linux',
            cpu: 'x64',
            packageName: '@webpresso/agent-kit-runtime-linux-x64',
          },
        ],
      },
      runtimeBinaryExists: () => false,
      builtExists: true,
      sourceExists: true,
      sourceNeedsSourceLaunch: true,
      pinnedNodeVersion: null,
      runtimeManager: null,
    })

    expect(plan).toMatchObject({
      mode: 'source',
      entrypoint: '/repo/src/cli/cli.ts',
      args: ['/repo/src/cli/cli.ts', 'hooks', 'doctor', '--skip-mcp'],
    })
  })

  it('prefers wp source when a CLI source file has no built counterpart', () => {
    const plan = buildLaunchPlan({
      binName: 'wp',
      repoRoot: '/repo',
      forwardedArgs: ['qa', '--print-command'],
      builtExists: true,
      sourceExists: true,
      sourceNeedsSourceLaunch: true,
      pinnedNodeVersion: null,
      runtimeManager: null,
    })

    expect(plan).toMatchObject({
      mode: 'source',
      entrypoint: '/repo/src/cli/cli.ts',
      args: ['/repo/src/cli/cli.ts', 'qa', '--print-command'],
    })
  })

  it('keeps latency-sensitive hook bins on built dist even when source is newer', () => {
    const plan = buildLaunchPlan({
      binName: 'wp-pretool-guard',
      repoRoot: '/repo',
      builtExists: true,
      sourceExists: true,
      builtMtimeMs: 100,
      sourceMtimeMs: 200,
      pinnedNodeVersion: null,
      runtimeManager: null,
    })

    expect(plan).toMatchObject({
      mode: 'built',
      entrypoint: '/repo/dist/esm/hooks/pretool-guard/index.js',
    })
  })
})
