/**
 * `ak audit tph|tph-e2e|bundle-budget` — packaged repository audits.
 *
 * The underlying audit scripts (`src/audit/audit-tph.ts`,
 * `src/audit/audit-tph-e2e.ts`) are Bun-native entrypoints that anchor
 * themselves at repo-root and emit formatted reports. Rather than
 * refactor them into library functions (Phase 2 scope is CLI wiring,
 * not audit logic), we spawn them as child processes and forward
 * stdout/stderr/exit-code. This preserves their behaviour exactly and
 * keeps the CLI a thin facade.
 */

import type { CAC } from 'cac'

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

interface AuditActionOptions {
  dist?: string
  fix?: boolean
  htmlEntry?: string
  ignore?: string | string[]
  json?: boolean
  maxHtmlEagerJsAssetBytes?: string
  maxHtmlEagerJsTotalBytes?: string
  maxJsAssetBytes?: string
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

export function registerAuditCommand(cli: CAC): void {
  cli
    .command('audit <kind> [target]', 'Run a packaged audit (tph, tph-e2e, bundle-budget)')
    .option('--fix', 'Attempt to auto-fix violations (forwarded to supported audits)')
    .option('--json', 'Emit JSON output (forwarded to supported audits)')
    .option('--dist <dir>', 'Built Vite dist directory for bundle-budget')
    .option('--html-entry <file>', 'HTML entry relative to dist for bundle-budget')
    .option('--max-js-asset-bytes <bytes>', 'Max size for any generated JS asset')
    .option('--max-html-eager-js-asset-bytes <bytes>', 'Max size for any HTML-eager JS asset')
    .option('--max-html-eager-js-total-bytes <bytes>', 'Max total size for HTML-eager JS assets')
    .option('--ignore <substring>', 'Ignore matching bundle-budget asset path; repeatable')
    .action(async (kind: string, target: string | undefined, options: AuditActionOptions) => {
      const forwarded: string[] = []
      if (options.fix) forwarded.push('--fix')
      if (options.json) forwarded.push('--json')
      if (target) forwarded.push(target)

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
        default: {
          console.error(`Unknown audit kind: ${kind}. Use 'tph', 'tph-e2e', or 'bundle-budget'.`)
          process.exit(1)
        }
      }
    })
}
