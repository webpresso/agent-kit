import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  replacementParitySupportCeiling,
  REPLACEMENT_PARITY_CAPABILITY_CROSSWALK,
} from '#cli/commands/init/scaffolders/agent-hooks/capability-matrix.js'

import {
  collectContinuityLifecycleProofs,
  collectHostSmokeFindings,
  referenceParityHostSmokeFixtures,
} from './reference-parity-host-smoke.fixtures.js'

describe('reference parity host smoke fixtures', () => {
  it('runs fixture-backed expectations for every replacement-critical host in default CI', () => {
    expect(referenceParityHostSmokeFixtures.map((fixture) => fixture.host).sort()).toStrictEqual([
      'claude',
      'codex',
      'cursor',
      'opencode',
    ])
    expect(referenceParityHostSmokeFixtures.every((fixture) => fixture.defaultCi === true)).toBe(
      true,
    )
    expect(
      referenceParityHostSmokeFixtures.map((fixture) => [
        fixture.host,
        fixture.schemaKind,
        fixture.requireEnvFlag,
      ]),
    ).toStrictEqual([
      ['claude', 'claude-settings', 'WP_REQUIRE_CLAUDE'],
      ['codex', 'codex-hooks', 'WP_REQUIRE_CODEX'],
      ['cursor', 'cursor-hooks', 'WP_REQUIRE_CURSOR'],
      ['opencode', 'opencode-plugin', 'WP_REQUIRE_OPENCODE'],
    ])
  })

  it('keeps generated managed configuration host-valid for every named host', () => {
    const findings = collectHostSmokeFindings()
    expect(
      findings.filter((finding) => finding.kind === 'config').map((finding) => finding.host),
    ).toStrictEqual(['claude', 'codex', 'cursor', 'opencode'])
    expect(
      findings.filter((finding) => finding.kind === 'config').every((finding) => finding.ok),
    ).toBe(true)
  })

  it('pins lifecycle output shape and degraded host distinctions without live binaries', () => {
    const findings = collectHostSmokeFindings()
    expect(
      findings.filter((finding) => finding.kind === 'lifecycle').every((finding) => finding.ok),
    ).toBe(true)

    const cursor = referenceParityHostSmokeFixtures.find((fixture) => fixture.host === 'cursor')
    expect(cursor?.support).toBe('degraded')
    expect(cursor?.requiredConfigFiles).toStrictEqual([])
    expect(cursor?.unsupportedLifecycle).toContain('postCompact')
    expect(cursor?.projectedLifecycle).not.toContain('preCompact')

    const opencode = referenceParityHostSmokeFixtures.find((fixture) => fixture.host === 'opencode')
    expect(opencode?.support).toBe('degraded')
    expect(opencode?.unsupportedLifecycle).toEqual(
      expect.arrayContaining(['beforeSubmitPrompt', 'stop']),
    )
  })

  it('proves continuity lifecycle coverage by host without inventing unsupported events', () => {
    const proofs = collectContinuityLifecycleProofs()

    expect(proofs).toHaveLength(20)
    expect(
      proofs.map((proof) => `${proof.host}:${proof.lifecycle}:${proof.support}`),
    ).toStrictEqual([
      'claude:startup:full',
      'claude:post-tool:full',
      'claude:user-prompt:full',
      'claude:stop:full',
      'claude:pre-compaction:full',
      'codex:startup:full',
      'codex:post-tool:full',
      'codex:user-prompt:full',
      'codex:stop:full',
      'codex:pre-compaction:full',
      'cursor:startup:degraded',
      'cursor:post-tool:degraded',
      'cursor:user-prompt:degraded',
      'cursor:stop:degraded',
      'cursor:pre-compaction:unsupported',
      'opencode:startup:degraded',
      'opencode:post-tool:degraded',
      'opencode:user-prompt:unsupported',
      'opencode:stop:unsupported',
      'opencode:pre-compaction:degraded',
    ])

    const unsupported = proofs.filter((proof) => proof.support === 'unsupported')
    expect(unsupported.map((proof) => `${proof.host}:${proof.lifecycle}`)).toStrictEqual([
      'cursor:pre-compaction',
      'opencode:user-prompt',
      'opencode:stop',
    ])
    expect(
      proofs.find((proof) => proof.host === 'opencode' && proof.lifecycle === 'pre-compaction')
        ?.managedCommand,
    ).toBeNull()
  })

  it('names missing or misadvertised tool discovery surfaces instead of silently skipping them', () => {
    const findings = collectHostSmokeFindings()
    const toolFindings = findings.filter((finding) => finding.kind === 'tool-discovery')

    expect(toolFindings.map((finding) => `${finding.host}:${finding.surface}`)).toStrictEqual([
      'claude:managed hook commands',
      'codex:mcp server config',
      'cursor:managed hook commands',
      'opencode:mcp server config',
    ])
    expect(toolFindings.every((finding) => finding.ok)).toBe(true)
  })

  it('keeps host setup smoke at degraded replacement parity until the matrix ceiling is full', () => {
    const crosswalk = REPLACEMENT_PARITY_CAPABILITY_CROSSWALK.find(
      (entry) => entry.capability === 'host setup smoke',
    )

    expect(crosswalk).toStrictEqual({
      capability: 'host setup smoke',
      events: [
        'SessionStart',
        'PreToolUse',
        'PostToolUse',
        'UserPromptSubmit',
        'Stop',
        'PreCompact',
      ],
      hosts: ['claude', 'codex', 'cursor', 'opencode'],
      notes:
        'Setup smoke covers emitted lifecycle hooks and must reflect degraded host/event gaps.',
    })
    expect(crosswalk ? replacementParitySupportCeiling(crosswalk) : 'unsupported').toBe('degraded')
    expect(
      referenceParityHostSmokeFixtures.map((fixture) => [fixture.host, fixture.support]),
    ).toEqual([
      ['claude', 'full'],
      ['codex', 'full'],
      ['cursor', 'degraded'],
      ['opencode', 'degraded'],
    ])
  })

  it('does not increase host smoke timeout budgets or add fixture timeout overrides', () => {
    const liveSmokeSource = readFileSync('src/cli/commands/init/host-smoke.e2e.test.ts', 'utf8')
    const fixtureSource = readFileSync(
      'src/__integration__/reference-parity-host-smoke.fixtures.ts',
      'utf8',
    )
    const fixtureTestSource = readFileSync(
      'src/__integration__/reference-parity-host-smoke.test.ts',
      'utf8',
    )

    expect(liveSmokeSource.match(/\b240_000\b/gu)?.length).toBe(7)
    expect(fixtureSource).not.toMatch(/\b\d+_000\b/u)
    expect(fixtureTestSource).not.toMatch(/\b\d+_000\b/u)
  })
})
