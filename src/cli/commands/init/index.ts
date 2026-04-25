import type { CAC } from 'cac'

/**
 * `ak setup` / `ak init` — scaffolds the agent-kit catalog into a consumer repo.
 *
 * Idempotent: re-runs reconcile against `.agent-kitrc.json`.
 * Safe-by-default: if a target file exists with different content, writes
 * to `<name>.new` unless `--overwrite` is passed.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { syncAll } from '#symlinker'

import {
  type AgentkitConfig,
  defaultConfig,
  mergeConfig,
  readConfig,
  writeConfig,
} from './config.js'
import { detectConsumer } from './detect-consumer.js'
import { type MergeOptions, summarizeResults } from './merge.js'
import { resolveTier3Selection } from './prompts.js'
import { scaffoldAgent } from './scaffold-agent.js'
import { scaffoldAgentsMd } from './scaffold-agents-md.js'
import { scaffoldBlueprints } from './scaffold-blueprints.js'
import { scaffoldDocs } from './scaffold-docs.js'
import { scaffoldBaseKit } from './scaffold-base-kit.js'
import { scaffoldMonorepoNav } from './scaffold-monorepo-nav.js'
import { scaffoldGstack } from './scaffolders/gstack/index.js'
import { scaffoldLoreCommits } from './scaffolders/lore-commits/index.js'
import { scaffoldOmx } from './scaffolders/omx/index.js'
import { checkRuntimes } from './scaffolders/runtime-check/index.js'

const PRESETS = ['lore-commits', 'omx', 'gstack'] as const
type Preset = (typeof PRESETS)[number]

function parsePresets(withFlag: string | undefined): Preset[] {
  if (!withFlag) return []
  return withFlag
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is Preset => (PRESETS as readonly string[]).includes(s))
}

export interface InitFlags {
  with?: string
  all?: boolean
  overwrite?: boolean
  'dry-run'?: boolean
  yes?: boolean
  cwd?: string
}

export const EXIT_SUCCESS = 0
export const EXIT_SETUP_FAIL = 1
export const EXIT_USER_ABORT = 2
export const EXIT_WRITE_FAIL = 3

export function resolveCatalogDir(): string {
  // The `catalog/` directory is bundled alongside `package.json` in the
  // published tarball (see `files` in package.json). To locate it at both
  // development time (src/cli/commands/init/index.ts) and at runtime (dist/cli.js),
  // we walk up from this module looking for the nearest package.json.
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 8; depth++) {
    if (existsSync(join(dir, 'package.json'))) {
      const candidate = join(dir, 'catalog')
      if (existsSync(candidate)) return candidate
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(
    'ak init: could not locate the agent-kit catalog directory. The package may be broken.',
  )
}

export async function runInit(flags: InitFlags): Promise<number> {
  const cwd = flags.cwd ?? process.cwd()
  const consumer = detectConsumer(cwd)
  if (!consumer) {
    console.error(
      `ak init: could not find a git repo (walked up from ${cwd}).\n` +
        `Run \`git init\` first, or pass --cwd pointing at a git working tree.`,
    )
    return EXIT_SETUP_FAIL
  }

  const catalogDir = resolveCatalogDir()
  const options: MergeOptions = {
    overwrite: flags.overwrite ?? false,
    dryRun: flags['dry-run'] ?? false,
  }

  const existingConfig = readConfig(consumer.repoRoot)
  const presets = parsePresets(flags.with)
  // Extract tier3 skills portion of --with (non-preset values)
  const withFlagWithoutPresets = flags.with
    ?.split(',')
    .map((s) => s.trim())
    .filter((s) => !(PRESETS as readonly string[]).includes(s))
    .join(',') || undefined

  let tier3Selection: string[]
  try {
    const selection = await resolveTier3Selection({
      withFlag: withFlagWithoutPresets,
      allFlag: flags.all,
      yesFlag: flags.yes,
      existing: existingConfig?.installed.tier3Skills,
      isTTY: Boolean(process.stdin.isTTY),
    })
    if (selection.aborted) {
      console.error('ak init: aborted by user.')
      return EXIT_USER_ABORT
    }
    tier3Selection = selection.selected
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return EXIT_SETUP_FAIL
  }

  console.log(`ak init: scaffolding into ${consumer.repoRoot}`)
  if (options.dryRun) console.log('  mode: DRY RUN (no writes)')
  if (options.overwrite)
    console.log('  mode: --overwrite (consumer customizations will be replaced)')
  console.log(
    `  Tier-3 skills: ${tier3Selection.length > 0 ? tier3Selection.join(', ') : '(none)'}`,
  )

  try {
    const agentReport = scaffoldAgent({
      catalogDir,
      repoRoot: consumer.repoRoot,
      selectedTier3: tier3Selection,
      options,
    })

    const baseKitResults = tier3Selection.includes('base-kit')
      ? scaffoldBaseKit({ catalogDir, repoRoot: consumer.repoRoot, options })
      : []

    const docsResults = scaffoldDocs({ catalogDir, repoRoot: consumer.repoRoot, options })
    const blueprintResults = scaffoldBlueprints({ repoRoot: consumer.repoRoot, options })
    const monorepoResults = scaffoldMonorepoNav({
      catalogDir,
      repoRoot: consumer.repoRoot,
      consumer,
      options,
    })

    const config: AgentkitConfig = mergeConfig(existingConfig, {
      ...defaultConfig(),
      installed: { tier3Skills: [...tier3Selection].toSorted() },
      lastInit: new Date().toISOString(),
    })

    const agentsMdResult = scaffoldAgentsMd({
      catalogDir,
      repoRoot: consumer.repoRoot,
      consumer,
      config,
      options,
    })

    if (!options.dryRun) {
      writeConfig(consumer.repoRoot, config)
    }

    // Apply scaffolder presets
    const presetResults = []
    if (presets.includes('lore-commits')) {
      presetResults.push(
        scaffoldLoreCommits({ repoRoot: consumer.repoRoot, options }),
      )
    }

    let omxFailure: 'not-found' | 'spawn-failed' | null = null
    if (presets.includes('omx')) {
      const omxResult = scaffoldOmx({ repoRoot: consumer.repoRoot, options })
      switch (omxResult.kind) {
        case 'omx-ok':
          console.log('  omx setup: ✓ ran successfully')
          break
        case 'omx-skipped-dry-run':
          console.log('  omx setup: skipped (--dry-run)')
          break
        case 'omx-not-found':
          console.error(`  omx setup: ✗ ${omxResult.hint}`)
          omxFailure = 'not-found'
          break
        case 'omx-spawn-failed':
          console.error(`  omx setup: ✗ exited with ${omxResult.exitCode}`)
          omxFailure = 'spawn-failed'
          break
      }
    }

    let gstackFailure: 'clone-failed' | 'setup-failed' | null = null
    if (presets.includes('gstack')) {
      const gstackResult = scaffoldGstack({ repoRoot: consumer.repoRoot, options })
      switch (gstackResult.kind) {
        case 'gstack-already-installed':
          console.log(`  gstack: ✓ already installed at ${gstackResult.root}`)
          break
        case 'gstack-installed':
          console.log(`  gstack: ✓ cloned + setup --team at ${gstackResult.root}`)
          break
        case 'gstack-skipped-dry-run':
          console.log('  gstack: skipped (--dry-run)')
          break
        case 'gstack-clone-failed':
          console.error(`  gstack: ✗ git clone exited with ${gstackResult.exitCode}`)
          gstackFailure = 'clone-failed'
          break
        case 'gstack-setup-failed':
          console.error(`  gstack: ✗ ./setup --team exited with ${gstackResult.exitCode}`)
          gstackFailure = 'setup-failed'
          break
      }
    }

    const all = [
      ...agentReport.results,
      ...baseKitResults,
      ...docsResults,
      ...blueprintResults,
      ...monorepoResults,
      ...(agentsMdResult ? [agentsMdResult] : []),
      ...presetResults,
    ]
    const summary = summarizeResults(all)

    console.log('\nScaffold summary:')
    console.log(`  created:         ${summary.created}`)
    console.log(`  identical:       ${summary.identical}`)
    console.log(`  overwritten:     ${summary.overwritten}`)
    console.log(`  sidecar (.new):  ${summary['sidecar-written']}`)
    if (options.dryRun) console.log(`  would-change:    ${summary['skipped-dry']}`)
    console.log(`  installed skills: ${agentReport.installedSkills.length}`)

    if (summary['sidecar-written'] > 0) {
      console.log(
        '\n  Note: some files exist with different content. New versions were\n' +
          '  written with a `.new` suffix — diff and merge manually, or re-run\n' +
          '  with `--overwrite` to replace them.',
      )
    }

    if (!options.dryRun) {
      console.log('\nWiring tool-specific surfaces (.claude/, .cursor/, .windsurf/, .gemini/)…')
      syncAll(consumer.repoRoot)
    }

    if (!options.dryRun) {
      const runtimes = checkRuntimes()
      if (runtimes.length > 0) {
        console.log('\nRuntime check:')
        for (const r of runtimes) {
          if (r.version) console.log(`  ${r.name}: ✓ ${r.version}`)
          else console.log(`  ${r.name}: ✗ not on PATH — ${r.hint}`)
        }
      }
    }

    console.log('\nak init: done.')
    if (omxFailure === 'not-found') return EXIT_SETUP_FAIL
    if (omxFailure === 'spawn-failed') return EXIT_WRITE_FAIL
    if (gstackFailure === 'clone-failed') return EXIT_WRITE_FAIL
    if (gstackFailure === 'setup-failed') return EXIT_WRITE_FAIL
    return EXIT_SUCCESS
  } catch (error) {
    console.error(
      `ak init: write failed — ${error instanceof Error ? error.message : String(error)}`,
    )
    return EXIT_WRITE_FAIL
  }
}

export type InitCommandName = 'setup' | 'init'

export function registerInitCommand(cli: CAC, commandName: InitCommandName = 'init'): void {
  const description =
    commandName === 'setup'
      ? 'Scaffold agent-kit catalog into the current repo'
      : 'Compatibility alias for ak setup'

  cli
    .command(commandName, description)
    .option('--with <skills>', 'Comma-separated Tier-3 skills to install (non-interactive)')
    .option('--all', 'Install every skill (Tier-1 + Tier-2 + all Tier-3)')
    .option(
      '--overwrite',
      'Replace consumer customizations (default: write new files to <name>.new)',
    )
    .option('--dry-run', 'Show what would change without writing anything')
    .option('--yes', 'Accept defaults, skip interactive prompts')
    .option('--cwd <dir>', 'Working tree to scaffold into (default: process.cwd())')
    .action(async (flags: InitFlags) => {
      const code = await runInit(flags)
      if (code !== EXIT_SUCCESS) {
        const err = new Error('exit') as Error & { exitCode: number }
        err.exitCode = code
        throw err
      }
      return code
    })
}
