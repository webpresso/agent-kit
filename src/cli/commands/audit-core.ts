import type { RepoAuditResult } from '#audit/repo-guardrails'

export type AuditKind =
  | 'tph'
  | 'tph-e2e'
  | 'bundle-budget'
  | 'commit-message'
  | 'blueprint-readme-drift'
  | 'blueprint-lifecycle'
  | 'roadmap-links'
  | 'docs-frontmatter'
  | 'catalog-drift'
  | 'package-surface'
  | 'agents'
  | 'tech-debt'
  | 'no-relative-parent-imports'
  | 'no-link-protocol'
  | 'vision'
  | 'bucket-boundary'
  | 'skill-sizes'
  | 'broken-refs'
  | 'memory-rotation'
  | 'gitignore-agent-surfaces'
  | 'memory-unified'
  | 'compile-drift'
  | 'architecture-drift'
  | 'cloudflare-deploy-contract'
  | 'toolchain-isolation'
  | 'absolute-path-policy'
  | 'no-first-party-mjs'
  | 'agent-cost'
  | 'blueprint-db-consistency'
  | 'tech-debt-cadence'
  | 'cross-repo-correlation'
  | 'ai-contracts'
  | 'mutation'
  | 'quality'
  | 'guardrails'
  | 'hook-surface'
  | 'hook-vendor-drift'
  | 'no-relative-package-scripts'
  | 'secrets-policy'
  | 'no-dev-vars'
  | 'secret-provider-quarantine'
  | 'secrets-config'
  | 'harness-surfaces'

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
  omxPlans?: boolean
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
      const { runTphAudit } = await import('#audit/audit-tph-runner')
      const root = options.root ?? target ?? deps.root
      const result = await runTphAudit(root)
      return {
        kind: 'repo-result',
        name: 'tph',
        result: {
          ok: result.errorCount === 0,
          title: 'Testing Philosophy Audit (TPH)',
          checked: result.filesChecked,
          violations: result.violations.map((v) => ({
            message: `[${v.rule}] ${v.message}`,
            file: v.file,
          })),
        },
      }
    }
    case 'tph-e2e': {
      const { runTphE2eAudit } = await import('#audit/audit-tph-e2e-runner')
      const root = options.root ?? target ?? deps.root
      const result = await runTphE2eAudit(root)
      return {
        kind: 'repo-result',
        name: 'tph-e2e',
        result: {
          ok: result.errorCount === 0,
          title: 'Testing Philosophy Audit (TPH) - E2E',
          checked: result.filesChecked,
          violations: result.violations.map((v) => ({
            message: `[${v.rule}] ${v.message}`,
            file: v.file,
          })),
        },
      }
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
      // previously this returned a bare `script-exit` and `wp audit guardrails`
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
    case 'secrets-policy': {
      const { auditSecretsPolicy } = await import('#audit/secrets-policy')
      const root = options.root ?? target ?? deps.root
      const result = auditSecretsPolicy(root)
      return { kind: 'repo-result', name: 'secrets-policy', result }
    }
    case 'no-dev-vars': {
      const { auditNoDevVars } = await import('#audit/no-dev-vars')
      const root = options.root ?? target ?? deps.root
      const result = auditNoDevVars(root)
      return { kind: 'repo-result', name: 'no-dev-vars', result }
    }
    case 'secret-provider-quarantine': {
      const { auditSecretProviderQuarantine } = await import('#audit/secret-provider-quarantine')
      const root = options.root ?? target ?? deps.root
      const result = auditSecretProviderQuarantine(root)
      return { kind: 'repo-result', name: 'secret-provider-quarantine', result }
    }
    case 'secrets-config': {
      const { auditSecretsConfig } = await import('#audit/secrets-config')
      const root = options.root ?? target ?? deps.root
      const result = auditSecretsConfig(root)
      return { kind: 'repo-result', name: 'secrets-config', result }
    }
    default: {
      return { kind: 'unknown-kind', auditKind }
    }
  }
}
