import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  evaluateRepoVisibilityReadiness,
  evaluatePluginNativeLauncherPolicy,
  listPackedRuntimePayloadLeaks,
  listMissingPackedRuntimePaths,
  listMissingRuntimeOptionalDependencies,
} from './public-readiness.js'
import {
  AGENT_KIT_TARBALL_SIZE_BUDGET_BYTES,
  AGENT_KIT_TARBALL_UNPACKED_SIZE_BUDGET_BYTES,
  evaluateAgentKitTarballSizeBudget,
} from '../src/build/runtime-surface-policy.js'

describe('public-readiness runtime policy helpers', () => {
  const runtimeManifest = {
    binaryName: 'wp',
    targets: [
      {
        id: 'darwin-arm64',
        os: 'darwin',
        bunTarget: 'bun-darwin-arm64',
        packageName: '@webpresso/agent-kit-runtime-darwin-arm64',
      },
      {
        id: 'windows-x64',
        os: 'win32',
        bunTarget: 'bun-windows-x64',
        packageName: '@webpresso/agent-kit-runtime-windows-x64',
      },
    ],
  } as const

  it('flags missing or mismatched runtime optional dependencies', () => {
    expect(
      listMissingRuntimeOptionalDependencies(runtimeManifest, '0.28.0', {
        '@webpresso/agent-kit-runtime-darwin-arm64': '0.28.0',
      }),
    ).toEqual(['@webpresso/agent-kit-runtime-windows-x64'])
  })

  it('accepts the pure-native Claude plugin launcher policy', () => {
    expect(
      evaluatePluginNativeLauncherPolicy({
        mcpServers: {
          webpresso: { command: '${CLAUDE_PLUGIN_ROOT}/bin/wp', args: ['mcp'] },
        },
      }),
    ).toEqual({
      commandOk: true,
      argsOk: true,
      command: '${CLAUDE_PLUGIN_ROOT}/bin/wp',
      args: ['mcp'],
    })
  })

  it('flags missing packed thin-root artifacts including the staged host launcher', () => {
    expect(listMissingPackedRuntimePaths(runtimeManifest, ['bin/runtime-manifest.json'])).toEqual([
      'bin/wp',
    ])
  })

  it('flags denied packed runtime payload trees', () => {
    expect(
      listPackedRuntimePayloadLeaks([
        'bin/runtime/darwin-arm64/wp',
        'dist/runtime/darwin-arm64/wp',
        'dist/runtime-packages/agent-kit-runtime-darwin-arm64/bin/wp',
        'bin/wp',
      ]),
    ).toEqual([
      'bin/runtime/darwin-arm64/wp',
      'dist/runtime/darwin-arm64/wp',
      'dist/runtime-packages/agent-kit-runtime-darwin-arm64/bin/wp',
    ])
  })

  it('enforces an explicit tarball size budget for the thin-root runtime surface', () => {
    expect(
      evaluateAgentKitTarballSizeBudget({
        size: AGENT_KIT_TARBALL_SIZE_BUDGET_BYTES,
        unpackedSize: AGENT_KIT_TARBALL_UNPACKED_SIZE_BUDGET_BYTES,
      }),
    ).toMatchObject({ sizeOk: true, unpackedOk: true })

    expect(
      evaluateAgentKitTarballSizeBudget({
        size: AGENT_KIT_TARBALL_SIZE_BUDGET_BYTES + 1,
        unpackedSize: AGENT_KIT_TARBALL_UNPACKED_SIZE_BUDGET_BYTES + 1,
      }),
    ).toMatchObject({ sizeOk: false, unpackedOk: false })
  })

  it('packs the prepared manifest with scripts disabled to avoid double prepack', () => {
    const source = readFileSync(join(import.meta.dirname, 'public-readiness.ts'), 'utf8')
    const packIndex = source.indexOf("['pack', '--ignore-scripts', '--dry-run', '--json']")

    expect(packIndex).toBeGreaterThan(source.indexOf('preparePackedManifest(ROOT)'))
    expect(source.indexOf('restorePackedManifest(ROOT)', packIndex)).toBeGreaterThan(packIndex)
  })

  it('requires packed native session-memory engine paths in the tarball readiness script', () => {
    const source = readFileSync(join(import.meta.dirname, 'public-readiness.ts'), 'utf8')

    expect(source).toContain('tarball-session-memory-native-engine')
    expect(source).toContain('native/session-memory-engine/Cargo.toml')
    expect(source).toContain('native/session-memory-engine/crates/session-memory-core/Cargo.toml')
  })
})

describe('public release readiness gate wiring', () => {
  const repositoryRoot = join(import.meta.dirname, '..')

  it('exercises host fallback skill projection in the packed consumer smoke', () => {
    const source = readFileSync(join(repositoryRoot, 'scripts', 'public-consumer-smoke.ts'), 'utf8')

    expect(source).toContain("WP_SKIP_CLAUDE_PLUGIN: '1'")
    expect(source).toContain("WP_SKIP_CODEX_PLUGIN: '1'")
    expect(source).toContain("'--host', 'all'")
    expect(source).not.toContain("'--host', 'none'")
  })

  it('evaluates public repository visibility from explicit history evidence', () => {
    expect(
      evaluateRepoVisibilityReadiness({
        repoAlreadyPublic: false,
        historyClassification: 'clean-public-snapshot-preferred',
        publicHistoryTaskStatus: 'done',
      }),
    ).toEqual({
      name: 'repo-visibility-readiness',
      status: 'PASS',
      detail: 'clean-public-snapshot-preferred executed',
    })

    expect(
      evaluateRepoVisibilityReadiness({
        repoAlreadyPublic: false,
        historyClassification: 'clean-public-snapshot-preferred',
        publicHistoryTaskStatus: 'planned',
      }),
    ).toEqual({
      name: 'repo-visibility-readiness',
      status: 'BLOCKED',
      detail: 'clean-public-snapshot-preferred; public history Task 1.5 still pending',
    })

    expect(
      evaluateRepoVisibilityReadiness({
        repoAlreadyPublic: true,
        historyClassification: 'missing',
        publicHistoryTaskStatus: null,
      }),
    ).toEqual({
      name: 'repo-visibility-readiness',
      status: 'PASS',
      detail: 'repository already public; snapshot strategy superseded by operator override',
    })
  })

  it('loads public-repository history evidence from the public-release scrub task', () => {
    const source = readFileSync(join(repositoryRoot, 'scripts', 'public-readiness.ts'), 'utf8')

    expect(source).toContain(
      "'blueprints/completed/agent-kit-public-release-scrub/_overview.md'",
    )
    expect(source).toContain("const PUBLIC_HISTORY_TASK_ID = '1.5'")
    expect(source).not.toContain('2026-06-01-agent-kit-global-distribution-mcp-runtime-fix.md')
  })
})
