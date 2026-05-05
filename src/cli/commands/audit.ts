/**
 * `ak audit <kind>` — packaged repository audits.
 *
 * TPH audits remain script-backed for now because they are Bun-native
 * entrypoints. Repo guardrail audits are library-backed so consumers can
 * use the same logic from the CLI and from `@webpresso/agent-kit/local`.
 */

import type { RepoAuditResult } from '#audit/repo-guardrails'
import type { CAC } from 'cac'

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Run `stryker run` in the given directory and return its exit code.
 * Looks for a local `stryker` binary via npx/node_modules before
 * falling back to a globally-installed stryker.
 */
async function runStryker(cwd: string): Promise<number> {
  return new Promise<number>((resolve) => {
    // Prefer the locally installed stryker via npx so consumers don't need a
    // global install.  The '--yes' flag ensures npx installs on first run when
    // not already cached.
    const child = spawn('npx', ['--yes', 'stryker', 'run'], {
      cwd,
      stdio: 'inherit',
      shell: false,
    })
    child.on('error', (error) => {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(`Failed to spawn stryker: ${reason}`)
      resolve(1)
    })
    child.on('exit', (code) => {
      resolve(code ?? 1)
    })
  })
}

/**
 * Registry of repo-level (RepoAuditResult-shaped) audits — single source of
 * truth. Adding an entry here surfaces the audit in three places at once:
 *
 *   1. `ak audit <kind>` standalone dispatch
 *   2. `ak audit guardrails` composite (consumed by pre-commit + CI)
 *   3. `ak audit quality` full ship gate (mutation + composite)
 *
 * Each runner closes over the option-mapping for its audit so the dispatcher
 * stays generic. Audits with a different shape (script-backed: tph, tph-e2e;
 * caller-paths: bundle-budget, commit-message; composites: mutation, quality)
 * are dispatched separately.
 */
type RepoAuditRunner = (
  root: string,
  options: AuditActionOptions,
) => Promise<RepoAuditResult> | RepoAuditResult

const REPO_AUDIT_REGISTRY: Record<string, RepoAuditRunner> = {
  'catalog-drift': async (root) =>
    (await import('#audit/repo-guardrails')).auditCatalogDrift(root),
  'blueprint-lifecycle': async (root, options) =>
    (await import('#audit/repo-guardrails')).auditBlueprintLifecycle(root, {
      includeLegacyOmx: options.legacyOmx,
    }),
  'docs-frontmatter': async (root, options) =>
    (await import('#audit/repo-guardrails')).auditDocsFrontmatter(root, {
      docsRoot: options.docsRoot,
    }),
  agents: async (root) => (await import('#audit/agents')).auditAgents(root),
  vision: async (root, options) =>
    (await import('#audit/vision-doc')).auditVision(root, {
      visionPath: options.visionPath,
    }),
  'tech-debt': async (root) => (await import('#audit/tech-debt')).auditTechDebt(root),
  'no-relative-parent-imports': async (root) =>
    (await import('#audit/repo-guardrails')).auditNoRelativeParentImports(root),
  'bucket-boundary': async (root, options) =>
    (await import('#audit/bucket-boundary')).auditBucketBoundary(root, {
      changedOnly: options.changedOnly,
      strict: options.strict,
    }),
}

const REPO_AUDIT_KINDS = Object.keys(REPO_AUDIT_REGISTRY)

/**
 * Run every audit in REPO_AUDIT_REGISTRY and report. Returns 0 only if all OK.
 */
async function runRepoGuardrailsGate(
  root: string,
  options: AuditActionOptions,
): Promise<number> {
  const { formatRepoAuditReport } = await import('#audit/repo-guardrails')

  let allOk = true
  for (const name of REPO_AUDIT_KINDS) {
    const runner = REPO_AUDIT_REGISTRY[name]
    if (!runner) continue
    const result = await runner(root, options)
    if (options.json) {
      console.log(JSON.stringify({ audit: name, ...result }, null, 2))
    } else {
      console.log(formatRepoAuditReport(result))
    }
    if (!result.ok) allOk = false
  }

  return allOk ? 0 : 1
}

/**
 * Composite quality gate: mutation + repo guardrails composite.
 * Runs sequentially and exits non-zero on the first failure (fast-fail).
 */
async function runQualityGate(root: string, options: AuditActionOptions): Promise<number> {
  console.log('\n[quality] running mutation tests...')
  const mutationCode = await runStryker(root)
  if (mutationCode !== 0) {
    console.error('[quality] mutation: FAILED')
    return mutationCode
  }
  console.log('[quality] mutation: OK')

  return runRepoGuardrailsGate(root, options)
}

interface AuditActionOptions {
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
  strict?: boolean
  visionPath?: string
}

function resolveAuditScript(name: 'audit-tph.ts' | 'audit-tph-e2e.ts'): string {
  // Source layout: `src/cli/commands/audit.ts` → `../../audit/<name>`.
  // After `bun build` the whole CLI is bundled into `dist/cli.js`, so the
  // audit scripts are NOT available at runtime via a relative path; we
  // fall back to the source location under the package root.
  const fromSource = new URL(`../../audit/${name}`, import.meta.url)
  if (existsSync(fromSource)) {
    return fromSource.pathname
  }

  // Last-resort: look alongside the bundled CLI.
  const bundleDir = path.dirname(new URL(import.meta.url).pathname)
  const packageRoot = path.resolve(bundleDir, '..')
  return path.join(packageRoot, 'src', 'audit', name)
}

async function runAuditScript(script: string, extraArgs: readonly string[]): Promise<number> {
  const runtime = process.env.BUN_INSTALL
    ? 'bun'
    : // Bun ships with these scripts as #!/usr/bin/env bun, so prefer bun if
      // available via PATH. Fall back to node, which will fail clearly if
      // the script uses Bun-only APIs.
      'bun'

  return new Promise<number>((resolve) => {
    const child = spawn(runtime, [script, ...extraArgs], {
      stdio: 'inherit',
    })
    child.on('error', (error) => {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(
        `Failed to spawn audit runner (${runtime}): ${reason}\nInstall Bun (https://bun.sh) or run the audit script directly.`,
      )
      resolve(1)
    })
    child.on('exit', (code) => {
      resolve(code ?? 1)
    })
  })
}

function buildBundleBudgetArgs(target: string | undefined, options: AuditActionOptions): string[] {
  const args: string[] = []
  if (target) args.push(target)
  if (options.dist) args.push('--dist', String(options.dist))
  if (options.htmlEntry) args.push('--html-entry', String(options.htmlEntry))
  if (options.maxJsAssetBytes) args.push('--max-js-asset-bytes', String(options.maxJsAssetBytes))
  if (options.maxHtmlEagerJsAssetBytes) {
    args.push('--max-html-eager-js-asset-bytes', String(options.maxHtmlEagerJsAssetBytes))
  }
  if (options.maxHtmlEagerJsTotalBytes) {
    args.push('--max-html-eager-js-total-bytes', String(options.maxHtmlEagerJsTotalBytes))
  }
  const ignore = Array.isArray(options.ignore)
    ? options.ignore
    : options.ignore
      ? [options.ignore]
      : []
  for (const ignoredPath of ignore) args.push('--ignore', String(ignoredPath))
  return args
}

/**
 * Audit kinds the dispatcher recognizes, beyond the generic registry-driven
 * ones. Repo-level audits are derived from REPO_AUDIT_REGISTRY and inserted
 * automatically; this list only names the bespoke / composite kinds.
 */
const SCRIPT_AUDIT_KINDS = ['tph', 'tph-e2e'] as const
const SPECIAL_AUDIT_KINDS = [
  'bundle-budget',
  'commit-message',
  'mutation',
  'guardrails',
  'quality',
] as const

const AUDIT_KINDS = [
  ...SCRIPT_AUDIT_KINDS,
  ...SPECIAL_AUDIT_KINDS.slice(0, 2),
  ...REPO_AUDIT_KINDS,
  ...SPECIAL_AUDIT_KINDS.slice(2),
]

const AUDIT_KIND_LIST = AUDIT_KINDS.join(', ')

export function registerAuditCommand(cli: CAC): void {
  cli
    .command(
      'audit [kind] [target]',
      `Run a packaged audit (${AUDIT_KIND_LIST})`,
    )
    .option('--fix', 'Attempt to auto-fix violations (forwarded to supported audits)')
    .option('--json', 'Emit JSON output (forwarded to supported audits)')
    .option('--dist <dir>', 'Built Vite dist directory for bundle-budget')
    .option('--root <dir>', 'Repository root for repo guardrail audits')
    .option('--strict', 'Zero-tolerance mode: all violations are errors (bucket-boundary)')
    .option('--changed-only', 'Restrict to packages touched in git diff --name-only origin/main (bucket-boundary)')
    .option('--docs-root <dir>', 'Docs directory for docs-frontmatter')
    .option('--message-file <file>', 'Commit message file for commit-message')
    .option('--require-lore', 'Require Lore trailers (hard-fail on missing/malformed trailers)')
    .option('--lore-warn', 'Warn about missing Lore trailers but always exit 0 (soft adoption mode)')
    .option('--legacy-omx', 'Include legacy .omx plan checks for blueprint-lifecycle')
    .option('--html-entry <file>', 'HTML entry relative to dist for bundle-budget')
    .option('--max-js-asset-bytes <bytes>', 'Max size for any generated JS asset')
    .option('--max-html-eager-js-asset-bytes <bytes>', 'Max size for any HTML-eager JS asset')
    .option('--max-html-eager-js-total-bytes <bytes>', 'Max total size for HTML-eager JS assets')
    .option('--ignore <substring>', 'Ignore matching bundle-budget asset path; repeatable')
    .option('--vision-path <path>', "Path to VISION.md for the 'vision' audit (default: VISION.md)")
    .action(async (kind: string | undefined, target: string | undefined, options: AuditActionOptions) => {
      if (!kind) {
        console.error(`Usage: ak audit <kind> [target]\nKinds: ${AUDIT_KIND_LIST}`)
        process.exit(1)
      }
      const forwarded: string[] = []
      if (options.fix) forwarded.push('--fix')
      if (options.json) forwarded.push('--json')
      if (target) forwarded.push(target)

      // Generic dispatch for repo-level audits — entry per audit lives in
      // REPO_AUDIT_REGISTRY (single source of truth). Keep the bespoke
      // switch below for kinds with non-uniform shapes.
      const repoAuditRunner = REPO_AUDIT_REGISTRY[kind]
      if (repoAuditRunner) {
        const root = options.root ?? target ?? process.cwd()
        await exitWithRepoAudit(await repoAuditRunner(root, options), options)
        return
      }

      switch (kind) {
        case 'tph': {
          const script = resolveAuditScript('audit-tph.ts')
          const code = await runAuditScript(script, forwarded)
          process.exit(code)
        }
        case 'tph-e2e': {
          const script = resolveAuditScript('audit-tph-e2e.ts')
          const code = await runAuditScript(script, forwarded)
          process.exit(code)
        }
        case 'bundle-budget': {
          const { runBundleBudgetCli } = await import('../../vite/local.js')
          const bundleBudgetArgs = buildBundleBudgetArgs(target, options)
          const code = await runBundleBudgetCli(bundleBudgetArgs)
          process.exit(code)
        }
        case 'commit-message': {
          const { auditCommitMessageFile } = await import('#audit/repo-guardrails')
          const messageFile = options.messageFile ?? target
          if (!messageFile) {
            console.error('commit-message requires a message file target or --message-file <file>.')
            process.exit(1)
          }
          await exitWithRepoAudit(
            auditCommitMessageFile(messageFile, {
              requireLore: options.requireLore,
              loreWarn: options.loreWarn,
            }),
            options,
          )
          return
        }
        case 'mutation': {
          const cwd = options.root ?? target ?? process.cwd()
          const code = await runStryker(cwd)
          process.exit(code)
        }
        case 'guardrails': {
          const root = options.root ?? target ?? process.cwd()
          const code = await runRepoGuardrailsGate(root, options)
          process.exit(code)
        }
        case 'quality': {
          const root = options.root ?? target ?? process.cwd()
          const code = await runQualityGate(root, options)
          process.exit(code)
        }
        default: {
          console.error(`Unknown audit kind: ${kind}. Use one of: ${AUDIT_KIND_LIST}.`)
          process.exit(1)
        }
      }
    })
}

async function exitWithRepoAudit(
  auditResult: RepoAuditResult,
  options: AuditActionOptions,
): Promise<void> {
  const { formatRepoAuditReport } = await import('#audit/repo-guardrails')
  if (options.json) {
    console.log(JSON.stringify(auditResult, null, 2))
  } else {
    console.log(formatRepoAuditReport(auditResult))
  }
  process.exit(auditResult.ok ? 0 : 1)
}
