import type { RepoAuditResult } from '#audit/repo-guardrails'

export type AuditKind =
  | 'tph'
  | 'tph-e2e'
  | 'bundle-budget'
  | 'commit-message'
  | 'blueprint-lifecycle'
  | 'roadmap-links'
  | 'docs-frontmatter'
  | 'catalog-drift'
  | 'agents'
  | 'tech-debt'
  | 'no-relative-parent-imports'
  | 'no-link-protocol'
  | 'vision'
  | 'bucket-boundary'
  | 'skill-sizes'
  | 'broken-refs'
  | 'memory-rotation'
  | 'mutation'
  | 'quality'
  | 'guardrails'

export type AuditOutcome =
  | { kind: 'invalid-usage'; message: string }
  | { kind: 'unknown-kind'; auditKind: string }
  | { kind: 'script-exit'; code: number }
  | { kind: 'repo-result'; name: string; result: RepoAuditResult }
  | {
      kind: 'aggregate-result'
      code: number
      results: ReadonlyArray<{ name: string; result: RepoAuditResult }>
    }
  | { kind: 'quality-exit'; code: number; mutationCode: number; guardrailsCode: number }

export interface AuditActionOptions {
  changedOnly?: boolean
  dist?: string
  docsRoot?: string
  fix?: boolean
  htmlEntry?: string
  ignore?: string | string[]
  json?: boolean
  legacyOmx?: boolean
  loreWarn?: boolean
  maxHtmlEagerJsAssetBytes?: string
  maxHtmlEagerJsTotalBytes?: string
  maxJsAssetBytes?: string
  messageFile?: string
  requireLore?: boolean
  root?: string
  staged?: boolean
  strict?: boolean
  visionPath?: string
}

export interface AuditDeps {
  root: string
  runStryker: (cwd: string) => Promise<number>
  runScript: (script: string, args: string[]) => Promise<number>
  runRepoAudit: (
    name: string,
    root: string,
    options: AuditActionOptions,
  ) => Promise<RepoAuditResult> | RepoAuditResult
  runBundleBudget: (args: string[]) => Promise<number>
  runCommitMessageAudit: (
    messageFile: string,
    options: AuditActionOptions,
  ) => RepoAuditResult | Promise<RepoAuditResult>
  resolveScript: (name: 'audit-tph.ts' | 'audit-tph-e2e.ts') => string
  buildBundleBudgetArgs: (target: string | undefined, options: AuditActionOptions) => string[]
  knownRepoKinds: readonly string[]
}

export async function runAuditDispatch(
  auditKind: string | undefined,
  targets: string[],
  options: AuditActionOptions,
  deps: AuditDeps,
): Promise<AuditOutcome> {
  if (!auditKind) {
    return { kind: 'invalid-usage', message: 'No audit kind provided.' }
  }

  const target = targets[0]

  // Repo-level registry dispatch (catalog-drift, blueprint-lifecycle, etc.)
  if (deps.knownRepoKinds.includes(auditKind)) {
    const root = options.root ?? target ?? deps.root
    const result = await deps.runRepoAudit(auditKind, root, options)
    return { kind: 'repo-result', name: auditKind, result }
  }

  const forwarded: string[] = []
  if (options.fix) forwarded.push('--fix')
  if (options.json) forwarded.push('--json')
  if (target) forwarded.push(target)

  switch (auditKind) {
    case 'tph': {
      const script = deps.resolveScript('audit-tph.ts')
      const code = await deps.runScript(script, forwarded)
      return { kind: 'script-exit', code }
    }
    case 'tph-e2e': {
      const script = deps.resolveScript('audit-tph-e2e.ts')
      const code = await deps.runScript(script, forwarded)
      return { kind: 'script-exit', code }
    }
    case 'bundle-budget': {
      const args = deps.buildBundleBudgetArgs(target, options)
      const code = await deps.runBundleBudget(args)
      return { kind: 'script-exit', code }
    }
    case 'commit-message': {
      const messageFile = options.messageFile ?? target
      if (!messageFile) {
        return {
          kind: 'invalid-usage',
          message: 'commit-message requires a message file target or --message-file <file>.',
        }
      }
      const result = await deps.runCommitMessageAudit(messageFile, options)
      return { kind: 'repo-result', name: 'commit-message', result }
    }
    case 'mutation': {
      const cwd = options.root ?? target ?? deps.root
      const code = await deps.runStryker(cwd)
      return { kind: 'script-exit', code }
    }
    case 'guardrails': {
      const root = options.root ?? target ?? deps.root
      // Run every known repo audit kind and aggregate
      const results: Array<{ name: string; result: RepoAuditResult }> = []
      let allOk = true
      for (const name of deps.knownRepoKinds) {
        const result = await deps.runRepoAudit(name, root, options)
        if (!result.ok) allOk = false
        results.push({ name, result })
      }
      // Surface every per-audit result so the shell can print failures —
      // previously this returned a bare `script-exit` and `ak audit guardrails`
      // would exit 1 with zero output, hiding the actual cause from the
      // pre-commit hook output.
      return { kind: 'aggregate-result', code: allOk ? 0 : 1, results }
    }
    case 'quality': {
      const root = options.root ?? target ?? deps.root
      const mutationCode = await deps.runStryker(root)

      // Run guardrails sequentially after mutation
      let guardrailsOk = true
      for (const name of deps.knownRepoKinds) {
        const result = await deps.runRepoAudit(name, root, options)
        if (!result.ok) guardrailsOk = false
      }
      const guardrailsCode = guardrailsOk ? 0 : 1
      const code = mutationCode !== 0 ? mutationCode : guardrailsCode

      return { kind: 'quality-exit', code, mutationCode, guardrailsCode }
    }
    default: {
      return { kind: 'unknown-kind', auditKind }
    }
  }
}
