import type { AuditResult } from '#audit/audit-tph-detect'
import type { RepoAuditResult } from '#audit/repo-guardrails'

import { beforeEach, describe, expect, test, vi } from 'vitest'

import { runAuditDispatch } from './audit-core.js'
import type { AuditActionOptions, AuditDeps } from './audit-core.js'

const mockRunTphAudit = vi.fn<() => Promise<AuditResult>>()
const mockRunTphE2eAudit = vi.fn<() => Promise<AuditResult>>()

vi.mock('#audit/audit-tph-runner', () => ({
  runTphAudit: mockRunTphAudit,
}))

vi.mock('#audit/audit-tph-e2e-runner', () => ({
  runTphE2eAudit: mockRunTphE2eAudit,
}))

function tphResult(errorCount = 0): AuditResult {
  return { filesChecked: 3, violations: [], errorCount, warningCount: 0, infoCount: 0 }
}

function okResult(title: string): RepoAuditResult {
  return { ok: true, title, checked: 1, violations: [] }
}

function failResult(title: string): RepoAuditResult {
  return { ok: false, title, checked: 1, violations: [{ message: 'bad' }] }
}

function makeDeps(overrides: Partial<AuditDeps> = {}): AuditDeps {
  return {
    root: '/repo',
    runStryker: vi.fn().mockResolvedValue(0),
    runRepoAudit: vi.fn().mockResolvedValue(okResult('test')),
    runBundleBudget: vi.fn().mockResolvedValue(0),
    runCommitMessageAudit: vi.fn().mockReturnValue(okResult('commit-message')),
    buildBundleBudgetArgs: vi.fn().mockReturnValue([]),
    knownRepoKinds: [
      'catalog-drift',
      'blueprint-lifecycle',
      'docs-frontmatter',
      'architecture-drift',
      'session-memory-hardcut',
    ],
    ...overrides,
  }
}

const noOptions: AuditActionOptions = {}

beforeEach(() => {
  mockRunTphAudit.mockResolvedValue(tphResult(0))
  mockRunTphE2eAudit.mockResolvedValue(tphResult(0))
})

describe('runAuditDispatch', () => {
  test('kind undefined → invalid-usage', async () => {
    const result = await runAuditDispatch(undefined, [], noOptions, makeDeps())
    expect(result.kind).toBe('invalid-usage')
  })

  test('kind unknown → unknown-kind', async () => {
    const result = await runAuditDispatch('not-a-real-kind', [], noOptions, makeDeps())
    expect(result).toStrictEqual({ kind: 'unknown-kind', auditKind: 'not-a-real-kind' })
  })

  describe('tph', () => {
    test('passes → repo-result with ok: true', async () => {
      mockRunTphAudit.mockResolvedValue(tphResult(0))
      const result = await runAuditDispatch('tph', [], noOptions, makeDeps())
      expect(result.kind).toBe('repo-result')
      if (result.kind !== 'repo-result') return
      expect(result.name).toBe('tph')
      expect(result.result.ok).toBe(true)
      expect(result.result.checked).toBe(3)
    })

    test('errors → repo-result with ok: false', async () => {
      mockRunTphAudit.mockResolvedValue({
        filesChecked: 3,
        violations: [
          { file: 'a.test.ts', severity: 'ERROR', rule: 'over-mocking', message: 'too many mocks' },
        ],
        errorCount: 1,
        warningCount: 0,
        infoCount: 0,
      })
      const result = await runAuditDispatch('tph', [], noOptions, makeDeps())
      expect(result.kind).toBe('repo-result')
      if (result.kind !== 'repo-result') return
      expect(result.result.ok).toBe(false)
      expect(result.result.violations).toHaveLength(1)
    })

    test('uses deps.root as the scan root', async () => {
      await runAuditDispatch('tph', [], noOptions, makeDeps({ root: '/custom' }))
      expect(mockRunTphAudit).toHaveBeenCalledWith('/custom')
    })

    test('options.root overrides deps.root', async () => {
      await runAuditDispatch('tph', [], { root: '/override' }, makeDeps())
      expect(mockRunTphAudit).toHaveBeenCalledWith('/override')
    })

    test('target overrides deps.root when no options.root', async () => {
      await runAuditDispatch('tph', ['/target'], noOptions, makeDeps())
      expect(mockRunTphAudit).toHaveBeenCalledWith('/target')
    })
  })

  describe('tph-e2e', () => {
    test('passes → repo-result with ok: true', async () => {
      mockRunTphE2eAudit.mockResolvedValue(tphResult(0))
      const result = await runAuditDispatch('tph-e2e', [], noOptions, makeDeps())
      expect(result.kind).toBe('repo-result')
      if (result.kind !== 'repo-result') return
      expect(result.name).toBe('tph-e2e')
      expect(result.result.ok).toBe(true)
    })

    test('errors → repo-result with ok: false', async () => {
      mockRunTphE2eAudit.mockResolvedValue(tphResult(1))
      const result = await runAuditDispatch('tph-e2e', [], noOptions, makeDeps())
      expect(result.kind).toBe('repo-result')
      if (result.kind !== 'repo-result') return
      expect(result.result.ok).toBe(false)
    })

    test('uses deps.root as the scan root', async () => {
      await runAuditDispatch('tph-e2e', [], noOptions, makeDeps({ root: '/e2e-root' }))
      expect(mockRunTphE2eAudit).toHaveBeenCalledWith('/e2e-root')
    })
  })

  describe('bundle-budget', () => {
    test('calls buildBundleBudgetArgs + runBundleBudget', async () => {
      const deps = makeDeps()
      ;(deps.buildBundleBudgetArgs as ReturnType<typeof vi.fn>).mockReturnValue(['--dist', 'dist'])
      ;(deps.runBundleBudget as ReturnType<typeof vi.fn>).mockResolvedValue(0)
      const result = await runAuditDispatch('bundle-budget', ['dist'], noOptions, deps)
      expect(result).toStrictEqual({ kind: 'script-exit', code: 0 })
      expect(deps.buildBundleBudgetArgs).toHaveBeenCalledWith('dist', noOptions)
      expect(deps.runBundleBudget).toHaveBeenCalledWith(['--dist', 'dist'])
    })
  })

  describe('commit-message', () => {
    test('missing message file → invalid-usage', async () => {
      const result = await runAuditDispatch('commit-message', [], noOptions, makeDeps())
      expect(result.kind).toBe('invalid-usage')
      expect((result as { kind: 'invalid-usage'; message: string }).message).toContain(
        'commit-message',
      )
    })

    test('message file via target → repo-result', async () => {
      const deps = makeDeps()
      ;(deps.runCommitMessageAudit as ReturnType<typeof vi.fn>).mockReturnValue(
        okResult('commit-message'),
      )
      const result = await runAuditDispatch('commit-message', ['/tmp/msg'], noOptions, deps)
      expect(result).toStrictEqual({
        kind: 'repo-result',
        name: 'commit-message',
        result: okResult('commit-message'),
      })
      expect(deps.runCommitMessageAudit).toHaveBeenCalledWith('/tmp/msg', noOptions)
    })

    test('message file via --message-file option → repo-result', async () => {
      const deps = makeDeps()
      const options: AuditActionOptions = { messageFile: '/opt/msg' }
      const result = await runAuditDispatch('commit-message', [], options, deps)
      expect(result.kind).toBe('repo-result')
      expect(deps.runCommitMessageAudit).toHaveBeenCalledWith('/opt/msg', options)
    })
  })

  describe('mutation', () => {
    test('calls runStryker, returns script-exit with code', async () => {
      const deps = makeDeps()
      ;(deps.runStryker as ReturnType<typeof vi.fn>).mockResolvedValue(0)
      const result = await runAuditDispatch('mutation', [], noOptions, deps)
      expect(result).toStrictEqual({ kind: 'script-exit', code: 0 })
      expect(deps.runStryker).toHaveBeenCalledWith('/repo')
    })

    test('stryker failure → script-exit code 1', async () => {
      const deps = makeDeps()
      ;(deps.runStryker as ReturnType<typeof vi.fn>).mockResolvedValue(1)
      const result = await runAuditDispatch('mutation', [], noOptions, deps)
      expect(result).toStrictEqual({ kind: 'script-exit', code: 1 })
    })

    test('uses --root option as cwd', async () => {
      const deps = makeDeps()
      const result = await runAuditDispatch('mutation', [], { root: '/custom/root' }, deps)
      expect(result.kind).toBe('script-exit')
      expect(deps.runStryker).toHaveBeenCalledWith('/custom/root')
    })
  })

  describe('guardrails', () => {
    test('all ok → aggregate-result with code 0 and per-audit results', async () => {
      const deps = makeDeps()
      ;(deps.runRepoAudit as ReturnType<typeof vi.fn>).mockResolvedValue(okResult('test'))
      const result = await runAuditDispatch('guardrails', [], noOptions, deps)
      expect(result.kind).toBe('aggregate-result')
      if (result.kind !== 'aggregate-result') return
      expect(result.code).toBe(0)
      expect(result.results).toHaveLength(5)
      expect(deps.runRepoAudit).toHaveBeenCalledTimes(5)
    })

    test('one failure → aggregate-result with code 1 and the failed audit reported', async () => {
      const deps = makeDeps()
      ;(deps.runRepoAudit as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(okResult('catalog-drift'))
        .mockResolvedValueOnce(failResult('blueprint-lifecycle'))
        .mockResolvedValueOnce(okResult('docs-frontmatter'))
      const result = await runAuditDispatch('guardrails', [], noOptions, deps)
      expect(result.kind).toBe('aggregate-result')
      if (result.kind !== 'aggregate-result') return
      expect(result.code).toBe(1)
      expect(result.results.map((r) => ({ name: r.name, ok: r.result.ok }))).toStrictEqual([
        { name: 'catalog-drift', ok: true },
        { name: 'blueprint-lifecycle', ok: false },
        { name: 'docs-frontmatter', ok: true },
        { name: 'architecture-drift', ok: true },
        { name: 'session-memory-hardcut', ok: true },
      ])
    })

    test('calls runRepoAudit for each registry entry', async () => {
      const deps = makeDeps()
      await runAuditDispatch('guardrails', [], noOptions, deps)
      expect(deps.runRepoAudit).toHaveBeenCalledWith('catalog-drift', '/repo', noOptions)
      expect(deps.runRepoAudit).toHaveBeenCalledWith('blueprint-lifecycle', '/repo', noOptions)
      expect(deps.runRepoAudit).toHaveBeenCalledWith('docs-frontmatter', '/repo', noOptions)
      expect(deps.runRepoAudit).toHaveBeenCalledWith('architecture-drift', '/repo', noOptions)
      expect(deps.runRepoAudit).toHaveBeenCalledWith('session-memory-hardcut', '/repo', noOptions)
    })
  })

  describe('quality', () => {
    test('mutation ok + guardrails ok → quality-exit code 0', async () => {
      const deps = makeDeps()
      ;(deps.runStryker as ReturnType<typeof vi.fn>).mockResolvedValue(0)
      ;(deps.runRepoAudit as ReturnType<typeof vi.fn>).mockResolvedValue(okResult('test'))
      const result = await runAuditDispatch('quality', [], noOptions, deps)
      expect(result).toStrictEqual({
        kind: 'quality-exit',
        code: 0,
        mutationCode: 0,
        guardrailsCode: 0,
      })
    })

    test('mutation fails → quality-exit code = mutationCode, still runs guardrails', async () => {
      const deps = makeDeps()
      ;(deps.runStryker as ReturnType<typeof vi.fn>).mockResolvedValue(1)
      ;(deps.runRepoAudit as ReturnType<typeof vi.fn>).mockResolvedValue(okResult('test'))
      const result = await runAuditDispatch('quality', [], noOptions, deps)
      expect(result).toStrictEqual({
        kind: 'quality-exit',
        code: 1,
        mutationCode: 1,
        guardrailsCode: 0,
      })
    })

    test('guardrails fail → quality-exit code 1 when mutation ok', async () => {
      const deps = makeDeps()
      ;(deps.runStryker as ReturnType<typeof vi.fn>).mockResolvedValue(0)
      ;(deps.runRepoAudit as ReturnType<typeof vi.fn>).mockResolvedValue(failResult('test'))
      const result = await runAuditDispatch('quality', [], noOptions, deps)
      expect(result).toStrictEqual({
        kind: 'quality-exit',
        code: 1,
        mutationCode: 0,
        guardrailsCode: 1,
      })
    })

    test('calls both stryker and repo audit deps', async () => {
      const deps = makeDeps()
      await runAuditDispatch('quality', [], noOptions, deps)
      expect(deps.runStryker).toHaveBeenCalledOnce()
      expect(deps.runRepoAudit).toHaveBeenCalledTimes(5)
    })
  })

  describe('registry-based kinds (catalog-drift, blueprint-lifecycle, docs-frontmatter, architecture-drift)', () => {
    test('catalog-drift → calls runRepoAudit, returns repo-result', async () => {
      const deps = makeDeps()
      const auditResult = okResult('Catalog drift')
      ;(deps.runRepoAudit as ReturnType<typeof vi.fn>).mockResolvedValue(auditResult)
      const result = await runAuditDispatch('catalog-drift', [], noOptions, deps)
      expect(result).toStrictEqual({
        kind: 'repo-result',
        name: 'catalog-drift',
        result: auditResult,
      })
      expect(deps.runRepoAudit).toHaveBeenCalledWith('catalog-drift', '/repo', noOptions)
    })

    test('blueprint-lifecycle with options.root → passes root to runRepoAudit', async () => {
      const deps = makeDeps()
      const options: AuditActionOptions = { root: '/custom' }
      await runAuditDispatch('blueprint-lifecycle', [], options, deps)
      expect(deps.runRepoAudit).toHaveBeenCalledWith('blueprint-lifecycle', '/custom', options)
    })

    test('docs-frontmatter with target → passes target as root when no options.root', async () => {
      const deps = makeDeps()
      await runAuditDispatch('docs-frontmatter', ['/target-root'], noOptions, deps)
      expect(deps.runRepoAudit).toHaveBeenCalledWith('docs-frontmatter', '/target-root', noOptions)
    })

    test('architecture-drift -> calls runRepoAudit, returns repo-result', async () => {
      const deps = makeDeps()
      const auditResult = okResult('Architecture drift')
      ;(deps.runRepoAudit as ReturnType<typeof vi.fn>).mockResolvedValue(auditResult)
      const result = await runAuditDispatch('architecture-drift', [], noOptions, deps)
      expect(result).toStrictEqual({
        kind: 'repo-result',
        name: 'architecture-drift',
        result: auditResult,
      })
      expect(deps.runRepoAudit).toHaveBeenCalledWith('architecture-drift', '/repo', noOptions)
    })

    test('failed repo audit → returns repo-result with ok: false', async () => {
      const deps = makeDeps()
      const bad = failResult('Catalog drift')
      ;(deps.runRepoAudit as ReturnType<typeof vi.fn>).mockResolvedValue(bad)
      const result = await runAuditDispatch('catalog-drift', [], noOptions, deps)
      expect(result).toStrictEqual({ kind: 'repo-result', name: 'catalog-drift', result: bad })
    })
  })
})
