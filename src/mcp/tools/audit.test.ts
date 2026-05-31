/**
 * Tests for the `wp_audit` MCP tool.
 *
 * Mocks the underlying audit library functions and the `node:child_process`
 * `spawn` (used for the tph kind which runs as a Bun script). Asserts each
 * `kind` dispatches correctly, that successful audits return
 * `{passed: true, ...}`, and that failures (thrown OR ok=false) return
 * `{passed: false, ...}` without crashing the handler.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

const repoGuardrailsMock = {
  auditCatalogDrift: vi.fn(),
  auditCommitMessageFile: vi.fn(),
  auditDocsFrontmatter: vi.fn(),
  auditBlueprintLifecycle: vi.fn(),
  formatRepoAuditReport: vi.fn(() => 'formatted report'),
}

const agentsAuditMock = {
  auditAgents: vi.fn(),
}

const techDebtMock = {
  auditTechDebt: vi.fn(),
}

const aiContractsMock = {
  auditAiContracts: vi.fn(),
}

const architectureDriftMock = {
  auditArchitectureDrift: vi.fn(),
}

const cloudflareDeployContractMock = {
  auditCloudflareDeployContract: vi.fn(),
}

const absolutePathPolicyMock = {
  auditAbsolutePathPolicy: vi.fn(),
}

const viteLocalMock = {
  runBundleBudgetCli: vi.fn(),
}

vi.mock('#audit/repo-guardrails', () => repoGuardrailsMock)
vi.mock('#audit/agents', () => agentsAuditMock)
vi.mock('#audit/tech-debt', () => techDebtMock)
vi.mock('#audit/ai-contracts', () => aiContractsMock)
vi.mock('#audit/architecture-drift', () => architectureDriftMock)
vi.mock('#audit/cloudflare-deploy-contract', () => cloudflareDeployContractMock)
vi.mock('#audit/absolute-path-policy', () => absolutePathPolicyMock)
vi.mock('../../vite/local.js', () => viteLocalMock)
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import akAuditTool from './audit.js'

function fakeChild(opts: { stdout?: string; exitCode?: number } = {}): unknown {
  return {
    stdout: {
      on: (event: string, fn: (data: Buffer) => void) => {
        if (event === 'data' && opts.stdout) fn(Buffer.from(opts.stdout))
      },
    },
    stderr: {
      on: () => {},
    },
    on: (event: string, fn: (code: number) => void) => {
      if (event === 'close') queueMicrotask(() => fn(opts.exitCode ?? 0))
    },
  }
}

function passingAudit() {
  return { ok: true, title: 't', checked: 1, violations: [] }
}

function failingAudit() {
  return { ok: false, title: 't', checked: 1, violations: [{ message: 'boom' }] }
}

function parsePayload(result: {
  structuredContent?: unknown
  content: ReadonlyArray<{ type: string; text?: string }>
}) {
  return result.structuredContent as {
    passed: boolean
    summary: string
    kind: string
    details: unknown
    rawOutput?: string
    truncated?: boolean
  }
}

beforeEach(() => {
  for (const fn of Object.values(repoGuardrailsMock)) {
    if (typeof fn === 'function' && 'mockReset' in fn) (fn as { mockReset: () => void }).mockReset()
  }
  agentsAuditMock.auditAgents.mockReset()
  techDebtMock.auditTechDebt.mockReset()
  aiContractsMock.auditAiContracts.mockReset()
  architectureDriftMock.auditArchitectureDrift.mockReset()
  cloudflareDeployContractMock.auditCloudflareDeployContract.mockReset()
  absolutePathPolicyMock.auditAbsolutePathPolicy.mockReset()
  viteLocalMock.runBundleBudgetCli.mockReset()
  spawnMock.mockReset()
  repoGuardrailsMock.formatRepoAuditReport.mockReturnValue('formatted report')
})

describe('wp_audit tool', () => {
  it('exposes the expected descriptor surface', () => {
    expect(akAuditTool.name).toBe('wp_audit')
    expect(typeof akAuditTool.description).toBe('string')
    expect(akAuditTool.handler).toBeTypeOf('function')
  })

  describe('dispatch by kind (passing audits)', () => {
    it('catalog-drift -> auditCatalogDrift', async () => {
      repoGuardrailsMock.auditCatalogDrift.mockReturnValue(passingAudit())
      const result = await akAuditTool.handler({ kind: 'catalog-drift' })
      expect(repoGuardrailsMock.auditCatalogDrift).toHaveBeenCalledTimes(1)
      const payload = parsePayload(result)
      expect(payload.passed).toBe(true)
      expect(payload.summary).toBe('catalog-drift audit passed (1 checked)')
      expect(payload.kind).toBe('catalog-drift')
      expect((result.content[0] as { text: string }).text).toBe(
        'catalog-drift audit passed (1 checked)',
      )
    })

    it('docs-frontmatter -> auditDocsFrontmatter', async () => {
      repoGuardrailsMock.auditDocsFrontmatter.mockReturnValue(passingAudit())
      const result = await akAuditTool.handler({ kind: 'docs-frontmatter' })
      expect(repoGuardrailsMock.auditDocsFrontmatter).toHaveBeenCalledTimes(1)
      expect(parsePayload(result).passed).toBe(true)
    })

    it('agents -> auditAgents', async () => {
      agentsAuditMock.auditAgents.mockReturnValue(passingAudit())
      const result = await akAuditTool.handler({ kind: 'agents' })
      expect(agentsAuditMock.auditAgents).toHaveBeenCalledTimes(1)
      const payload = parsePayload(result)
      expect(payload.passed).toBe(true)
      expect(payload.kind).toBe('agents')
    })

    it('blueprint-lifecycle -> auditBlueprintLifecycle', async () => {
      repoGuardrailsMock.auditBlueprintLifecycle.mockReturnValue(passingAudit())
      const result = await akAuditTool.handler({ kind: 'blueprint-lifecycle' })
      expect(repoGuardrailsMock.auditBlueprintLifecycle).toHaveBeenCalledTimes(1)
      expect(parsePayload(result).passed).toBe(true)
    })

    it('commit-message -> auditCommitMessageFile (with no message file -> graceful failure)', async () => {
      const result = await akAuditTool.handler({ kind: 'commit-message' })
      const payload = parsePayload(result)
      expect(payload.passed).toBe(false)
      expect(payload.summary).toBe('commit-message audit could not run: message file missing')
      expect(payload.kind).toBe('commit-message')
    })

    it('tech-debt -> auditTechDebt', async () => {
      techDebtMock.auditTechDebt.mockReturnValue(passingAudit())
      const result = await akAuditTool.handler({ kind: 'tech-debt' })
      expect(techDebtMock.auditTechDebt).toHaveBeenCalledTimes(1)
      expect(parsePayload(result).passed).toBe(true)
    })

    it('ai-contracts -> auditAiContracts', async () => {
      aiContractsMock.auditAiContracts.mockReturnValue(passingAudit())
      const result = await akAuditTool.handler({ kind: 'ai-contracts' })
      expect(aiContractsMock.auditAiContracts).toHaveBeenCalledTimes(1)
      const payload = parsePayload(result)
      expect(payload.passed).toBe(true)
      expect(payload.kind).toBe('ai-contracts')
    })

    it('architecture-drift -> auditArchitectureDrift', async () => {
      architectureDriftMock.auditArchitectureDrift.mockReturnValue(passingAudit())
      const result = await akAuditTool.handler({ kind: 'architecture-drift' })
      expect(architectureDriftMock.auditArchitectureDrift).toHaveBeenCalledTimes(1)
      const payload = parsePayload(result)
      expect(payload.passed).toBe(true)
      expect(payload.kind).toBe('architecture-drift')
    })

    it('cloudflare-deploy-contract -> auditCloudflareDeployContract', async () => {
      cloudflareDeployContractMock.auditCloudflareDeployContract.mockResolvedValue(passingAudit())
      const result = await akAuditTool.handler({ kind: 'cloudflare-deploy-contract' })
      expect(cloudflareDeployContractMock.auditCloudflareDeployContract).toHaveBeenCalledTimes(1)
      const payload = parsePayload(result)
      expect(payload.passed).toBe(true)
      expect(payload.kind).toBe('cloudflare-deploy-contract')
    })

    it('absolute-path-policy -> auditAbsolutePathPolicy', async () => {
      absolutePathPolicyMock.auditAbsolutePathPolicy.mockReturnValue(passingAudit())
      const result = await akAuditTool.handler({ kind: 'absolute-path-policy' })
      expect(absolutePathPolicyMock.auditAbsolutePathPolicy).toHaveBeenCalledTimes(1)
      const payload = parsePayload(result)
      expect(payload.passed).toBe(true)
      expect(payload.kind).toBe('absolute-path-policy')
    })

    it('bundle-budget -> runBundleBudgetCli with directory arg', async () => {
      viteLocalMock.runBundleBudgetCli.mockResolvedValue(0)
      const result = await akAuditTool.handler({ kind: 'bundle-budget', directory: 'dist' })
      expect(viteLocalMock.runBundleBudgetCli).toHaveBeenCalledTimes(1)
      const args = viteLocalMock.runBundleBudgetCli.mock.calls[0]![0] as string[]
      expect(args).toContain('dist')
      expect(parsePayload(result).passed).toBe(true)
    })

    it('bundle-budget does not treat cwd as the dist target', async () => {
      viteLocalMock.runBundleBudgetCli.mockResolvedValue(0)
      const result = await akAuditTool.handler({
        kind: 'bundle-budget',
        cwd: '/repo/agent-kit',
      })
      expect(viteLocalMock.runBundleBudgetCli).toHaveBeenCalledTimes(1)
      const args = viteLocalMock.runBundleBudgetCli.mock.calls[0]![0] as string[]
      expect(args).toEqual([])
      expect(parsePayload(result).passed).toBe(true)
    })

    it('tph -> spawns bun on the tph script', async () => {
      spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }))
      const result = await akAuditTool.handler({ kind: 'tph' })
      expect(spawnMock).toHaveBeenCalledTimes(1)
      const [cmd, args] = spawnMock.mock.calls[0]!
      expect(cmd).toBe('bun')
      expect(Array.isArray(args)).toBe(true)
      expect((args as string[]).some((a) => a.includes('audit-tph'))).toBe(true)
      expect(parsePayload(result).passed).toBe(true)
    })

    it('tph-e2e -> spawns bun on the tph-e2e script', async () => {
      spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }))
      const result = await akAuditTool.handler({ kind: 'tph-e2e' })
      expect(spawnMock).toHaveBeenCalledTimes(1)
      const [cmd, args] = spawnMock.mock.calls[0]!
      expect(cmd).toBe('bun')
      expect(Array.isArray(args)).toBe(true)
      expect((args as string[]).some((a) => a.includes('audit-tph-e2e'))).toBe(true)
      expect(parsePayload(result).passed).toBe(true)
    })
  })

  describe('failing audits', () => {
    it('returns {passed:false} when ok=false (no throw)', async () => {
      repoGuardrailsMock.auditCatalogDrift.mockReturnValue(failingAudit())
      const result = await akAuditTool.handler({ kind: 'catalog-drift' })
      const payload = parsePayload(result)
      expect(payload.passed).toBe(false)
      expect(payload.summary).toBe('catalog-drift audit failed with 1 violation')
      expect(payload.kind).toBe('catalog-drift')
      expect(payload.details).toBeDefined()
    })

    it('catches thrown audit errors and returns {passed:false} with details message', async () => {
      repoGuardrailsMock.auditDocsFrontmatter.mockImplementation(() => {
        throw new Error('disk on fire')
      })
      const result = await akAuditTool.handler({ kind: 'docs-frontmatter' })
      const payload = parsePayload(result)
      expect(payload.passed).toBe(false)
      expect(payload.summary).toBe('docs-frontmatter audit crashed')
      expect(payload.kind).toBe('docs-frontmatter')
      expect(String(payload.details)).toContain('disk on fire')
    })

    it('bundle-budget returns {passed:false} when exit code is non-zero', async () => {
      viteLocalMock.runBundleBudgetCli.mockResolvedValue(1)
      const result = await akAuditTool.handler({ kind: 'bundle-budget' })
      expect(parsePayload(result).passed).toBe(false)
    })

    it('tph returns {passed:false} on non-zero exit', async () => {
      spawnMock.mockReturnValue(fakeChild({ exitCode: 2 }))
      const result = await akAuditTool.handler({ kind: 'tph' })
      const payload = parsePayload(result)
      expect(payload.passed).toBe(false)
      expect(payload.kind).toBe('tph')
      expect(payload.summary).toBe('tph audit failed (exit 2)')
    })

    it('tph-e2e returns {passed:false} on non-zero exit', async () => {
      spawnMock.mockReturnValue(fakeChild({ exitCode: 2 }))
      const result = await akAuditTool.handler({ kind: 'tph-e2e' })
      const payload = parsePayload(result)
      expect(payload.passed).toBe(false)
      expect(payload.kind).toBe('tph-e2e')
      expect(payload.summary).toBe('tph-e2e audit failed (exit 2)')
    })
  })

  describe('input validation', () => {
    it('rejects unknown kinds via zod parse', async () => {
      const result = await akAuditTool.handler({ kind: 'not-a-kind' })
      const payload = parsePayload(result)
      expect(payload.passed).toBe(false)
      expect(payload.summary).toMatch(/Invalid/)
    })
  })

  it('clips long script audit output and marks it truncated', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: 'x'.repeat(5_000), exitCode: 1 }))
    const result = await akAuditTool.handler({ kind: 'tph-e2e' })
    const payload = parsePayload(result)
    expect(payload.rawOutput).toHaveLength(4_000)
    expect(payload.truncated).toBe(true)
  })
})
