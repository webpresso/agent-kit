/**
 * `ak skill <new|list|show|deprecate|install|uninstall>` — thin shim over
 * shared content dispatch with two extra registry actions:
 *
 *   install <name>     — adds <name> to .agent-kitrc.json#installed.tier3Skills
 *                        (the skill must exist in the bundled catalog).
 *                        Idempotent. Registry-only edit; no copy.
 *   uninstall <name>   — removes <name> from the registry. Idempotent.
 *
 * `ak skills` (plural) was renamed to `ak skill` (singular) in 0.4.0. The
 * old plural is wired separately as a hidden helpful-error stub (see cli.ts).
 */

import type { CAC } from 'cac'

import { dispatchContent, type ContentSubcommand } from '#content/dispatch'
import { loadContent } from '#content/loader'
import { resolvePackageAsset } from '#utils/package-assets'

import {
  defaultConfig,
  mergeConfig,
  readConfig,
  writeConfig,
  type AgentkitConfig,
} from './init/config.js'

interface SkillCommandOptions {
  source?: string
  scope?: string
  title?: string
  reason?: string
  dryRun?: boolean
}

type SkillSubcommand = ContentSubcommand | 'install' | 'uninstall'

const SHARED_SUBS: readonly ContentSubcommand[] = ['new', 'list', 'show', 'deprecate']
const REGISTRY_SUBS = ['install', 'uninstall'] as const
const VALID_SUBS: readonly SkillSubcommand[] = [...SHARED_SUBS, ...REGISTRY_SUBS]

function isValidSub(value: string): value is SkillSubcommand {
  return (VALID_SUBS as readonly string[]).includes(value)
}

function isContentSub(value: SkillSubcommand): value is ContentSubcommand {
  return (SHARED_SUBS as readonly SkillSubcommand[]).includes(value)
}

function isValidSource(value: string | undefined): value is 'canonical' | 'consumer' | undefined {
  return value === undefined || value === 'canonical' || value === 'consumer'
}

function commandError(message: string, exitCode = 1): Error & { exitCode: number } {
  const err = new Error(message) as Error & { exitCode: number }
  err.exitCode = exitCode
  return err
}

function catalogContainsSkill(catalogDir: string, name: string): boolean {
  const result = loadContent({ catalogDir, kinds: ['skill'] })
  return result.records.some((r) => r.source === 'canonical' && r.slug === name)
}

function withRegistry(
  cwd: string,
  mutate: (skills: string[]) => string[],
): { config: AgentkitConfig; changed: boolean } {
  const existing = readConfig(cwd)
  const base = existing ?? defaultConfig()
  const before = [...base.installed.tier3Skills]
  const next = mutate(before)
  const incoming: AgentkitConfig = {
    ...base,
    installed: { tier3Skills: next.toSorted() },
  }
  const merged = existing ? { ...existing, installed: { tier3Skills: next.toSorted() } } : incoming
  const changed =
    before.length !== merged.installed.tier3Skills.length ||
    before.toSorted().join(',') !== merged.installed.tier3Skills.join(',')
  writeConfig(cwd, mergeConfig(existing, merged))
  return { config: merged, changed }
}

function handleInstall(name: string, catalogDir: string, cwd: string): void {
  if (!name) throw commandError('Usage: ak skill install <name>')
  if (!catalogContainsSkill(catalogDir, name)) {
    throw commandError(
      `Skill not found in bundled catalog: ${name}. Run \`ak skill list --source canonical\` to see available skills.`,
    )
  }
  const { config, changed } = withRegistry(cwd, (skills) =>
    skills.includes(name) ? skills : [...skills, name],
  )
  console.log(
    `${changed ? 'Installed' : 'Already installed'} skill ${name} → .agent-kitrc.json#installed.tier3Skills`,
  )
  console.log(`installed.tier3Skills: ${JSON.stringify(config.installed.tier3Skills)}`)
}

function handleUninstall(name: string, cwd: string): void {
  if (!name) throw commandError('Usage: ak skill uninstall <name>')
  const { config, changed } = withRegistry(cwd, (skills) => skills.filter((s) => s !== name))
  console.log(
    `${changed ? 'Uninstalled' : 'Not installed'} skill ${name} from .agent-kitrc.json#installed.tier3Skills`,
  )
  console.log(`installed.tier3Skills: ${JSON.stringify(config.installed.tier3Skills)}`)
}

export function registerSkillCommand(cli: CAC): void {
  cli
    .command(
      'skill <subcommand> [...args]',
      'Manage consumer skills (new|list|show|deprecate|install|uninstall)',
    )
    .option('--source <s>', 'Filter list by source: canonical | consumer')
    .option('--scope <s>', 'Scope for new: repo | package:<name> | path:<glob>')
    .option('--title <text>', 'Title for new')
    .option('--reason <text>', 'Reason for deprecate')
    .option('--dry-run', 'Plan without writing')
    .action(async (subcommand: string, args: string[], options: SkillCommandOptions) => {
      if (!isValidSub(subcommand)) {
        throw commandError(
          `Unknown skill subcommand: ${subcommand}. Use one of: ${VALID_SUBS.join(', ')}.`,
        )
      }
      if (!isValidSource(options.source)) {
        throw commandError(`Invalid --source: ${options.source}. Must be canonical or consumer.`)
      }

      const cwd = process.cwd()
      const catalogDir = resolvePackageAsset('catalog/agent')

      if (subcommand === 'install') {
        handleInstall(args[0] ?? '', catalogDir, cwd)
        return
      }
      if (subcommand === 'uninstall') {
        handleUninstall(args[0] ?? '', cwd)
        return
      }

      if (!isContentSub(subcommand)) {
        throw commandError(`Unknown skill subcommand: ${subcommand}`)
      }

      const result = await dispatchContent({
        kind: 'skill',
        sub: subcommand,
        args,
        options: {
          cwd,
          catalogDir,
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
        throw commandError(result.stderr || 'skill command failed', result.exitCode)
      }
    })
}

/**
 * Hidden stub for the renamed `ak skills` (plural). cac will still match
 * the command, but we just emit a helpful redirect and exit 1.
 */
export function registerSkillsRenameStub(cli: CAC): void {
  cli
    .command('skills [...args]', 'Removed in 0.4.0 — use `ak skill`')
    .allowUnknownOptions()
    .action(() => {
      throw commandError(
        "'ak skills' was renamed to 'ak skill' in 0.4.0. " +
          'Use: ak skill <subcommand>. See `ak skill --help`.',
      )
    })
}
