/**
 * `ak rule <new|list|show|deprecate>` — thin shim over shared content
 * dispatch in `src/content/dispatch.ts`. Handles consumer-owned rules at
 * `<repo>/agent-rules/<slug>.md`.
 */

import type { CAC } from 'cac'

import { dispatchContent, type ContentSubcommand } from '#content/dispatch'
import { resolvePackageAsset } from '#utils/package-assets'

interface RuleCommandOptions {
  source?: string
  scope?: string
  title?: string
  reason?: string
  dryRun?: boolean
}

const VALID_SUBS: readonly ContentSubcommand[] = ['new', 'list', 'show', 'deprecate']

function isValidSub(value: string): value is ContentSubcommand {
  return (VALID_SUBS as readonly string[]).includes(value)
}

function isValidSource(value: string | undefined): value is 'canonical' | 'consumer' | undefined {
  return value === undefined || value === 'canonical' || value === 'consumer'
}

export function registerRuleCommand(cli: CAC): void {
  cli
    .command('rule <subcommand> [...args]', 'Manage consumer rules (new|list|show|deprecate)')
    .option('--source <s>', 'Filter list by source: canonical | consumer')
    .option('--scope <s>', 'Scope for new: repo | package:<name> | path:<glob>')
    .option('--title <text>', 'Title for new')
    .option('--reason <text>', 'Reason for deprecate')
    .option('--dry-run', 'Plan without writing')
    .action(async (subcommand: string, args: string[], options: RuleCommandOptions) => {
      if (!isValidSub(subcommand)) {
        const err = new Error(
          `Unknown rule subcommand: ${subcommand}. Use one of: ${VALID_SUBS.join(', ')}.`,
        ) as Error & { exitCode: number }
        err.exitCode = 1
        throw err
      }
      if (!isValidSource(options.source)) {
        const err = new Error(
          `Invalid --source: ${options.source}. Must be canonical or consumer.`,
        ) as Error & { exitCode: number }
        err.exitCode = 1
        throw err
      }

      const result = await dispatchContent({
        kind: 'rule',
        sub: subcommand,
        args,
        options: {
          cwd: process.cwd(),
          catalogDir: resolvePackageAsset('catalog/agent'),
          ...(options.source ? { source: options.source } : {}),
          ...(options.scope ? { scope: options.scope } : {}),
          ...(options.title ? { title: options.title } : {}),
          ...(options.reason ? { reason: options.reason } : {}),
          ...(options.dryRun ? { dryRun: options.dryRun } : {}),
        },
      })
      if (result.stdout) console.log(result.stdout)
      if (result.stderr) console.error(result.stderr)
      if (result.exitCode !== 0) {
        const err = new Error(result.stderr || 'rule command failed') as Error & {
          exitCode: number
        }
        err.exitCode = result.exitCode
        throw err
      }
    })
}
