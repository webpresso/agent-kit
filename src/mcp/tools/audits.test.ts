import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoGuardrailsMock = {
  auditCatalogDrift: vi.fn(),
  auditDocsFrontmatter: vi.fn(),
  auditNoRelativePackageScripts: vi.fn(),
}

const blueprintReadmeDriftMock = {
  auditBlueprintReadmeDrift: vi.fn(),
}

const blueprintPrCoverageMock = {
  auditBlueprintPrCoverage: vi.fn(),
}

const packageSurfaceMock = {
  auditPackageSurface: vi.fn(),
}

const referenceParityMatrixMock = {
  auditReferenceParityMatrix: vi.fn(),
}

const agentsAuditMock = {
  auditAgents: vi.fn(),
}

const blueprintLifecycleSqlMock = {
  auditBlueprintLifecycleSql: vi.fn(),
}

const architectureDriftMock = {
  auditArchitectureDrift: vi.fn(),
}

const absolutePathPolicyMock = {
  auditAbsolutePathPolicy: vi.fn(),
}

const noFirstPartyMjsMock = {
  auditNoFirstPartyMjs: vi.fn(),
}

const toolchainIsolationMock = {
  auditToolchainIsolation: vi.fn(),
}

const openSourceLicensesMock = {
  auditOpenSourceLicenses: vi.fn(),
}

const secretsPolicyMock = {
  auditSecretsPolicy: vi.fn(),
}

const noDevVarsMock = {
  auditNoDevVars: vi.fn(),
}

const secretProviderQuarantineMock = {
  auditSecretProviderQuarantine: vi.fn(),
}

const secretsConfigMock = {
  auditSecretsConfig: vi.fn(),
}

const roadmapLinksMock = {
  auditRoadmapLinks: vi.fn(),
}

const techDebtMock = {
  auditTechDebt: vi.fn(),
}

const cloudflareDeployContractMock = {
  auditCloudflareDeployContract: vi.fn(),
}

const sessionMemoryHardcutMock = {
  auditSessionMemoryHardcut: vi.fn(),
}

const aiContractsMock = {
  auditAiContracts: vi.fn(),
}

const consumerAgentKitDependencyMock = {
  auditConsumerAgentKitDependency: vi.fn(),
}

const hookSurfaceMock = {
  auditHookSurface: vi.fn(),
}

const harnessSurfacesMock = {
  auditHarnessSurfaces: vi.fn(),
}

const weaknessMiningMock = {
  auditWeaknessMining: vi.fn(),
}

const harnessOverlayEvidenceMock = {
  auditHarnessOverlayEvidence: vi.fn(),
}

vi.mock('#audit/repo-guardrails', () => repoGuardrailsMock)
vi.mock('#audit/blueprint-readme-drift', () => blueprintReadmeDriftMock)
vi.mock('#audit/blueprint-pr-coverage', () => blueprintPrCoverageMock)
vi.mock('#audit/package-surface', () => packageSurfaceMock)
vi.mock('#audit/reference-parity-matrix', () => referenceParityMatrixMock)
vi.mock('#audit/agents', () => agentsAuditMock)
vi.mock('#audit/blueprint-lifecycle-sql', () => blueprintLifecycleSqlMock)
vi.mock('#audit/architecture-drift', () => architectureDriftMock)
vi.mock('#audit/absolute-path-policy', () => absolutePathPolicyMock)
vi.mock('#audit/no-first-party-mjs', () => noFirstPartyMjsMock)
vi.mock('#audit/toolchain-isolation', () => toolchainIsolationMock)
vi.mock('#audit/open-source-licenses', () => openSourceLicensesMock)
vi.mock('#audit/secrets-policy', () => secretsPolicyMock)
vi.mock('#audit/no-dev-vars', () => noDevVarsMock)
vi.mock('#audit/secret-provider-quarantine', () => secretProviderQuarantineMock)
vi.mock('#audit/secrets-config', () => secretsConfigMock)
vi.mock('#audit/roadmap-links', () => roadmapLinksMock)
vi.mock('#audit/tech-debt', () => techDebtMock)
vi.mock('#audit/cloudflare-deploy-contract', () => cloudflareDeployContractMock)
vi.mock('#audit/session-memory-hardcut', () => sessionMemoryHardcutMock)
vi.mock('#audit/ai-contracts', () => aiContractsMock)
vi.mock('#audit/consumer-agent-kit-dependency', () => consumerAgentKitDependencyMock)
vi.mock('#audit/hook-surface', () => hookSurfaceMock)
vi.mock('#audit/harness-surfaces', () => harnessSurfacesMock)
vi.mock('#audit/weakness-mining/index', () => weaknessMiningMock)
vi.mock('#audit/harness-overlay-evidence', () => harnessOverlayEvidenceMock)

import { resolveGuardrailAuditKinds } from '#cli/commands/audit'
import { isMCPAuditKind } from './_shared/audit-kinds.js'
import wpAuditsTool, { resolveGuardrailPresetKinds } from './audits.js'

function passingAudit(checked = 1) {
  return { ok: true, title: 'ok', checked, violations: [] }
}

function failingAudit(message = 'boom') {
  return { ok: false, title: 'bad', checked: 1, violations: [{ message }] }
}

function parsePayload(result: Awaited<ReturnType<typeof wpAuditsTool.handler>>) {
  return result.structuredContent as {
    passed: boolean
    summary: string
    total: number
    passedCount: number
    failedCount: number
    failedKinds: string[]
    results: Array<{
      kind: string
      passed: boolean
      summary: string
      details: unknown
      isError?: true
    }>
  }
}

beforeEach(() => {
  for (const group of [
    repoGuardrailsMock,
    blueprintReadmeDriftMock,
    blueprintPrCoverageMock,
    packageSurfaceMock,
    referenceParityMatrixMock,
    agentsAuditMock,
    blueprintLifecycleSqlMock,
    architectureDriftMock,
    absolutePathPolicyMock,
    noFirstPartyMjsMock,
    toolchainIsolationMock,
    openSourceLicensesMock,
    secretsPolicyMock,
    noDevVarsMock,
    secretProviderQuarantineMock,
    secretsConfigMock,
    roadmapLinksMock,
    techDebtMock,
    cloudflareDeployContractMock,
    sessionMemoryHardcutMock,
    aiContractsMock,
    consumerAgentKitDependencyMock,
    hookSurfaceMock,
    harnessSurfacesMock,
    weaknessMiningMock,
    harnessOverlayEvidenceMock,
  ]) {
    for (const fn of Object.values(group)) fn.mockReset()
  }
})

describe('wp_audits tool', () => {
  it('exposes a batch audit descriptor', () => {
    expect(wpAuditsTool.name).toBe('wp_audits')
    expect(wpAuditsTool.annotations?.readOnlyHint).toBe(true)
    expect(wpAuditsTool.description).toContain('multiple packaged repo audits')
  })

  it('keeps the guardrails preset aligned with CLI guardrails for MCP-supported audits', () => {
    const root = process.cwd()
    expect(resolveGuardrailPresetKinds(root)).toEqual(
      resolveGuardrailAuditKinds(root).filter(isMCPAuditKind),
    )
  })

  it('runs explicit kinds once each in first-seen order', async () => {
    repoGuardrailsMock.auditCatalogDrift.mockReturnValue(passingAudit(2))
    blueprintReadmeDriftMock.auditBlueprintReadmeDrift.mockReturnValue(passingAudit(3))

    const result = await wpAuditsTool.handler({
      kinds: ['catalog-drift', 'blueprint-readme-drift', 'catalog-drift'],
      cwd: '/repo',
    })

    expect(repoGuardrailsMock.auditCatalogDrift).toHaveBeenCalledTimes(1)
    expect(repoGuardrailsMock.auditCatalogDrift).toHaveBeenCalledWith('/repo')
    expect(blueprintReadmeDriftMock.auditBlueprintReadmeDrift).toHaveBeenCalledTimes(1)
    expect(blueprintReadmeDriftMock.auditBlueprintReadmeDrift).toHaveBeenCalledWith('/repo')

    const payload = parsePayload(result)
    expect(payload.passed).toBe(true)
    expect(payload.summary).toBe('wp_audits passed (2/2)')
    expect(payload.total).toBe(2)
    expect(payload.passedCount).toBe(2)
    expect(payload.failedCount).toBe(0)
    expect(payload.failedKinds).toEqual([])
    expect(payload.results.map((entry) => entry.kind)).toEqual([
      'catalog-drift',
      'blueprint-readme-drift',
    ])
  })

  it('keeps running after a failed audit and reports aggregate failure', async () => {
    repoGuardrailsMock.auditCatalogDrift.mockReturnValue(failingAudit('catalog stale'))
    blueprintReadmeDriftMock.auditBlueprintReadmeDrift.mockReturnValue(passingAudit())

    const result = await wpAuditsTool.handler({
      kinds: ['catalog-drift', 'blueprint-readme-drift'],
    })

    const payload = parsePayload(result)
    expect(payload.passed).toBe(false)
    expect(payload.summary).toBe('wp_audits failed (1/2): catalog-drift')
    expect(payload.total).toBe(2)
    expect(payload.passedCount).toBe(1)
    expect(payload.failedCount).toBe(1)
    expect(payload.failedKinds).toEqual(['catalog-drift'])
    expect(payload.results.map((entry) => [entry.kind, entry.passed])).toEqual([
      ['catalog-drift', false],
      ['blueprint-readme-drift', true],
    ])
  })

  it('captures an audit crash as one failed result and continues', async () => {
    repoGuardrailsMock.auditDocsFrontmatter.mockImplementation(() => {
      throw new Error('disk on fire')
    })
    blueprintReadmeDriftMock.auditBlueprintReadmeDrift.mockReturnValue(passingAudit())

    const result = await wpAuditsTool.handler({
      kinds: ['docs-frontmatter', 'blueprint-readme-drift'],
    })

    const payload = parsePayload(result)
    expect(payload.passed).toBe(false)
    expect(payload.failedKinds).toEqual(['docs-frontmatter'])
    expect(payload.results).toEqual([
      {
        kind: 'docs-frontmatter',
        passed: false,
        summary: 'docs-frontmatter audit crashed',
        details: 'disk on fire',
        isError: true,
      },
      {
        kind: 'blueprint-readme-drift',
        passed: true,
        summary: 'blueprint-readme-drift audit passed (1 checked)',
        details: passingAudit(),
      },
    ])
  })

  it('rejects input that specifies both kinds and preset', async () => {
    const result = await wpAuditsTool.handler({
      kinds: ['catalog-drift'],
      preset: 'guardrails',
    })

    const payload = parsePayload(result)
    expect(result.isError).toBe(true)
    expect(payload.passed).toBe(false)
    expect(payload.summary).toBe('Invalid wp_audits input')
    expect(payload.total).toBe(0)
    expect(payload.results).toEqual([])
  })

  it('resolves guardrails preset to the bounded repo guardrail audit set', async () => {
    const root = process.cwd()
    repoGuardrailsMock.auditCatalogDrift.mockReturnValue(passingAudit())
    packageSurfaceMock.auditPackageSurface.mockReturnValue(passingAudit())
    referenceParityMatrixMock.auditReferenceParityMatrix.mockReturnValue(passingAudit())
    blueprintReadmeDriftMock.auditBlueprintReadmeDrift.mockReturnValue(passingAudit())
    blueprintLifecycleSqlMock.auditBlueprintLifecycleSql.mockResolvedValue(passingAudit())
    roadmapLinksMock.auditRoadmapLinks.mockReturnValue(passingAudit())
    repoGuardrailsMock.auditDocsFrontmatter.mockReturnValue(passingAudit())
    agentsAuditMock.auditAgents.mockReturnValue(passingAudit())
    techDebtMock.auditTechDebt.mockReturnValue(passingAudit())
    repoGuardrailsMock.auditNoRelativePackageScripts.mockReturnValue(passingAudit())
    architectureDriftMock.auditArchitectureDrift.mockReturnValue(passingAudit())
    cloudflareDeployContractMock.auditCloudflareDeployContract.mockResolvedValue(passingAudit())
    absolutePathPolicyMock.auditAbsolutePathPolicy.mockReturnValue(passingAudit())
    noFirstPartyMjsMock.auditNoFirstPartyMjs.mockReturnValue(passingAudit())
    toolchainIsolationMock.auditToolchainIsolation.mockReturnValue(passingAudit())
    aiContractsMock.auditAiContracts.mockReturnValue(passingAudit())
    hookSurfaceMock.auditHookSurface.mockReturnValue({
      passed: true,
      details: { ok: true, violations: [] },
    })
    sessionMemoryHardcutMock.auditSessionMemoryHardcut.mockReturnValue(passingAudit())
    openSourceLicensesMock.auditOpenSourceLicenses.mockReturnValue(passingAudit())
    secretsPolicyMock.auditSecretsPolicy.mockReturnValue(passingAudit())
    noDevVarsMock.auditNoDevVars.mockReturnValue(passingAudit())
    secretProviderQuarantineMock.auditSecretProviderQuarantine.mockReturnValue(passingAudit())
    secretsConfigMock.auditSecretsConfig.mockReturnValue(passingAudit())
    consumerAgentKitDependencyMock.auditConsumerAgentKitDependency.mockReturnValue(passingAudit())
    harnessSurfacesMock.auditHarnessSurfaces.mockReturnValue(passingAudit())
    weaknessMiningMock.auditWeaknessMining.mockResolvedValue(passingAudit())
    harnessOverlayEvidenceMock.auditHarnessOverlayEvidence.mockReturnValue(passingAudit())

    const result = await wpAuditsTool.handler({ preset: 'guardrails', cwd: root, strict: true })
    const payload = parsePayload(result)

    expect(payload.passed).toBe(true)
    expect(payload.total).toBe(resolveGuardrailPresetKinds(root).length)
    expect(payload.results.map((entry) => entry.kind)).toEqual(resolveGuardrailPresetKinds(root))
    expect(referenceParityMatrixMock.auditReferenceParityMatrix).toHaveBeenCalledWith(
      root,
      undefined,
      { requireReleaseReady: true },
    )
  })
})
