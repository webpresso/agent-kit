import type { CAC } from 'cac'

/**
 * `wp setup` / `wp init` — scaffolds the webpresso catalog into a consumer repo.
 *
 * Idempotent: re-runs reconcile against `.webpressorc.json`.
 * Ownership-aware by default: webpresso refreshes the sections, structured
 * config keys, and generated surfaces it owns while leaving consumer-owned
 * divergent files untouched unless `--overwrite` is passed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'

import { isTelemetryEnabled, reportTthw } from '#telemetry/setup-tthw'
import { readPackageVersion } from '#cli/utils'
import { resolveBlueprintRoot } from '#utils/blueprint-root'

import { runUnifiedSync } from '#symlinker/unified-sync'
import { selectUnifiedConsumers } from '#symlinker/consumers'
import { pruneInactiveSkillDirs } from '#compiler/orphans'
import {
  type AgentkitConfig,
  defaultConfig,
  mergeConfig,
  readConfig,
  writeConfig,
} from './config.js'
import {
  detectConsumer,
  isAgentKitTemplateSourceRepo,
  setupCommandForRepo,
  warnIfNonLocalCli,
} from './detect-consumer.js'
import { runPreflight, DOCS_URL } from './preflight.js'
import { type MergeOptions, type MergeResult, summarizeResults } from './merge.js'
import { resolveTier3Selection } from './prompts.js'
import {
  assertManagedSkillSourcesPresent,
  isProjectedManagedSkillSlug,
  scaffoldAgent,
  SHARED_FAVORITE_SKILLS,
} from './scaffold-agent.js'
import { scaffoldAgentRules } from './scaffold-agent-rules.js'
import { scaffoldAgentSkills } from './scaffold-agent-skills.js'
import { scaffoldCatalogIgnore } from './scaffold-catalog-ignore.js'
import {
  GENERATED_PATHS_BLOCK,
  patchGitignore,
  untrackGeneratedGitignoredPaths,
} from './gitignore-patcher.js'
import { scaffoldAgentsMd } from './scaffold-agents-md.js'
import { scaffoldBlueprints } from './scaffold-blueprints.js'
import { scaffoldDocs } from './scaffold-docs.js'
import { resolveAgentKitPackageRoot } from './package-root.js'
import {
  BASE_KIT_QUALITY_TARGETS,
  collectRuntimeContractGuidance,
  scaffoldBaseKit,
} from './scaffold-base-kit.js'
import { scaffoldMonorepoNav } from './scaffold-monorepo-nav.js'
import { scaffoldPostinstallPin } from './scaffolders/postinstall-pin/index.js'
import {
  REQUIRED_CORE_CAPABILITIES,
  auditHostSkillVisibility,
  parseAgentHosts,
  serializeHostVisibility,
  summarizeHostSetupSurfaceVisibility,
  summarizeHostVisibility,
} from './host-visibility.js'
import { WP_HOOK_SPECS } from './scaffolders/agent-hooks/ir.js'
import {
  buildProposedHooksMapFromSpecs,
  generateHooksDryRunDiff,
  printSetupReport,
  type OutputWriter,
} from './scaffolders/agent-hooks/report.js'
import {
  readHooksManifest,
  type HookManifestVendor,
  withHookVendorState,
  writeHooksManifest,
} from './scaffolders/agent-hooks/manifest.js'
import {
  disableManagedHooksFromManifest,
  type ManagedHookVendor,
  restoreManagedHooksFromManifest,
  scaffoldAgentHooks,
  trustCodexWebpressoHooksForRepo,
  trustCodexPresetHooksForUser,
} from './scaffolders/agent-hooks/index.js'
import { ensureAgentKitGlobal } from './scaffolders/agent-kit-global/index.js'
import { scaffoldAuditHooks } from './scaffolders/audit-hooks/index.js'
import { ensureClaudeCodeUserPlugin } from './scaffolders/claude-plugin/index.js'
import { ensureCodexUserPlugin } from './scaffolders/codex-plugin/index.js'
import { scaffoldClaudeRules } from './scaffolders/claude-rules/index.js'
import { ensureCodexCli } from './scaffolders/codex-cli/index.js'
import { normalizeGlobalCodexHooksFile } from './scaffolders/agent-hooks/codex-global-normalize.js'
import {
  CONTEXT7_API_KEY_ENV,
  ensureClaudeContext7Mcp,
  ensureClaudePlaywrightMcp,
  ensureCodexContext7Mcp,
  ensureCodexWebpressoMcp,
  ensureCodexPlaywrightMcp,
} from './scaffolders/codex-mcp/index.js'
import { scaffoldExampleSkill } from './scaffolders/example-skill/index.js'
import { ensureGstack } from './scaffolders/gstack/index.js'
import { scaffoldLoreCommits } from './scaffolders/lore-commits/index.js'
import { ensureOmx } from './scaffolders/omx/index.js'
import { ensureOmc, OMC_SETUP_COMMAND } from './scaffolders/omc/index.js'
import { scaffoldOpencodePlugin } from './scaffolders/opencode-plugin/index.js'
import { ensureRtk } from './scaffolders/rtk/index.js'
import { checkRuntimes } from './scaffolders/runtime-check/index.js'
import { scaffoldSubagents } from './scaffolders/subagents/index.js'
import { maybeRunVisionInterview } from './scaffolders/vision/interview.js'
import { scaffoldVision } from './scaffolders/vision/index.js'
import { scaffoldWorkspaceConfig } from './scaffolders/workspace-config/index.js'

const PRESETS = [
  'example-skill',
  'gstack',
  'lore-commits',
  'omc',
  'omx',
  'playwright-mcp',
  'rtk',
  'vision',
] as const
type Preset = (typeof PRESETS)[number]
const DEFAULT_PRESETS: readonly Preset[] = ['omx', 'omc', 'gstack', 'vision', 'rtk']
const RTK_REQUESTED_MARKER = join('.agent', '.rtk-requested')

function parsePresets(withFlag: string | undefined): Preset[] {
  const explicit = withFlag
    ? withFlag
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is Preset => (PRESETS as readonly string[]).includes(s))
    : []
  return [...new Set([...DEFAULT_PRESETS, ...explicit])]
}

export interface InitFlags {
  with?: string
  without?: string
  host?: string
  all?: boolean
  overwrite?: boolean
  'dry-run'?: boolean
  dryRun?: boolean
  'restore-hooks'?: boolean
  restoreHooks?: boolean
  'disable-hooks'?: string
  disableHooks?: string
  yes?: boolean
  cwd?: string
  strict?: boolean
  project?: boolean
  sourceMaintenance?: boolean
}

export const EXIT_SUCCESS = 0
export const EXIT_SETUP_FAIL = 1
export const EXIT_USER_ABORT = 2
export const EXIT_WRITE_FAIL = 3

export interface InitCommandDeps {
  readonly stdout?: OutputWriter
}

export interface ResolveCatalogDirOptions {
  readonly moduleUrl?: string
  readonly execPath?: string
  readonly argv0?: string
  readonly argv1?: string
  readonly pathEnv?: string
}

export function resolveCatalogDir(options: ResolveCatalogDirOptions = {}): string {
  // The published native `bin/wp` binary executes from its own on-disk path,
  // while the bundled module URL can resolve inside Bun's virtual filesystem.
  // Probe both the module location and the real executable path so packed
  // installs still find the shipped `catalog/` directory.
  const root = resolveAgentKitPackageRoot({ ...options, requireCatalog: true })
  if (root) return join(root, 'catalog')

  throw new Error(
    'wp init: could not locate the webpresso catalog directory. The package may be broken.',
  )
}

function inferBlueprintsDirOverride(
  repoRoot: string,
  existingConfig: AgentkitConfig | null,
): string | undefined {
  if (existingConfig?.blueprintsDir) return existingConfig.blueprintsDir
  const resolved = resolveBlueprintRoot(repoRoot)
  const relativePath = relative(repoRoot, resolved).replaceAll('\\', '/')
  if (relativePath.length === 0 || relativePath === '.' || relativePath === 'blueprints') {
    return undefined
  }
  return relativePath
}

function readPackageJsonSafe(repoRoot: string): Record<string, unknown> | null {
  const packageJsonPath = join(repoRoot, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return null
  }

  try {
    return JSON.parse(readFileSync(packageJsonPath, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function printRuntimeContractGuidance(
  packageJson:
    | { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    | Record<string, unknown>
    | null
    | undefined,
): void {
  const guidance = collectRuntimeContractGuidance(packageJson)

  console.log('\nRuntime-owned tooling contract:')
  console.log('  wp now owns execution for test, e2e, lint, format, and typecheck.')
  console.log(
    '  Keep local dependencies that your tests, configs, or tsconfig types import directly.',
  )

  if (guidance.keepLocalAuthoringDeps.length > 0) {
    console.log(
      `  Keep local authoring deps when imported directly: ${guidance.keepLocalAuthoringDeps.join(', ')}`,
    )
  }

  if (guidance.reviewForRemovalDeps.length > 0) {
    console.log(
      `  Review execution-only deps for removal if they only powered local binaries: ${guidance.reviewForRemovalDeps.join(', ')}`,
    )
  }

  console.log('  Do not blanket-remove devDependencies just because wp can execute the tool.')
}

export function formatHostSetupSurfaceVisibility(input: {
  readonly repoRoot: string
  readonly packageRoot: string
}): string {
  const lines = summarizeHostSetupSurfaceVisibility(input)
  return ['Host setup surfaces:', ...lines].join('\n')
}

function parseDisableHooksTarget(value: string | undefined): readonly ManagedHookVendor[] | null {
  if (value === undefined) return null
  if (value === 'all') return ['claude', 'codex']
  if (value === 'claude' || value === 'codex') return [value]
  return null
}

async function runHooksRecovery(
  repoRoot: string,
  flags: InitFlags,
  options: MergeOptions,
): Promise<number> {
  const restoreHooks = flags.restoreHooks ?? flags['restore-hooks'] ?? false
  const disableHooksValue = flags.disableHooks ?? flags['disable-hooks']
  const disableVendors = parseDisableHooksTarget(disableHooksValue)

  if (restoreHooks && disableHooksValue !== undefined) {
    console.error('wp setup: choose either `--restore-hooks` or `--disable-hooks`, not both.')
    return EXIT_SETUP_FAIL
  }

  if (!restoreHooks && disableHooksValue === undefined) {
    return EXIT_SUCCESS
  }

  if (disableHooksValue !== undefined && disableVendors === null) {
    console.error('wp setup: `--disable-hooks` must be one of: claude, codex, all.')
    return EXIT_SETUP_FAIL
  }

  const manifest = readHooksManifest(repoRoot)
  if (manifest === null) {
    console.error(
      `wp setup: no .webpresso/hooks-manifest.json found — run \`${setupCommandForRepo(repoRoot)}\` first.`,
    )
    return EXIT_SETUP_FAIL
  }

  const scaffoldInput = { repoRoot, options, trustCodexHooks: false } as const
  const selectedVendors = disableVendors ?? (['claude', 'codex'] as const)
  const mutationResult = restoreHooks
    ? restoreManagedHooksFromManifest(scaffoldInput, manifest)
    : disableManagedHooksFromManifest(scaffoldInput, manifest, selectedVendors)

  const nextManifest = restoreHooks
    ? withHookVendorState(manifest, ['claude', 'codex'], 'enabled')
    : withHookVendorState(manifest, selectedVendors as readonly HookManifestVendor[], 'disabled')

  if (!options.dryRun) {
    writeHooksManifest(repoRoot, nextManifest.claude, nextManifest.codex, nextManifest.vendorState)
  }

  if (mutationResult.codex !== undefined) {
    const codexHooksPath = join(repoRoot, '.codex', 'hooks.json')
    normalizeGlobalCodexHooksFile(
      codexHooksPath,
      {
        nodeBinary: process.execPath,
      },
      options,
    )
    if (restoreHooks) {
      await trustCodexWebpressoHooksForRepo(scaffoldInput)
    }
  }

  const results = [mutationResult.claude, mutationResult.codex].filter(
    (result): result is MergeResult => result !== undefined,
  )
  const summary = summarizeResults(results)

  console.log(`wp setup: ${restoreHooks ? 'restoring' : 'disabling'} managed hooks in ${repoRoot}`)
  if (options.dryRun) console.log('  mode: DRY RUN (no writes)')
  console.log(`  created:         ${summary.created}`)
  console.log(`  identical:       ${summary.identical}`)
  console.log(`  overwritten:     ${summary.overwritten}`)
  if (options.dryRun) console.log(`  would-change:    ${summary['skipped-dry']}`)
  console.log('  → Run `wp hooks status` to verify hook states')

  return EXIT_SUCCESS
}

export async function runInit(flags: InitFlags, deps: InitCommandDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? process.stdout
  const startMs = Date.now()
  const cwd = flags.cwd ?? process.cwd()
  const consumer = detectConsumer(cwd)
  if (!consumer) {
    console.error(
      `wp init: could not find a git repo (walked up from ${cwd}).\n` +
        `Run \`git init\` first, or pass --cwd pointing at a git working tree.`,
    )
    return EXIT_SETUP_FAIL
  }

  // Self-repo guard: agent-kit is the SOURCE of every agent-surface template
  // (catalog/, the tracked .agent/.claude surfaces). Scaffolding into its own
  // working tree overwrites those canonical sources — the footgun where a stray
  // `wp setup` reported `overwritten: 2, drifted: 11, git index cleanup: 6
  // untracked` against the live repo. Refuse loudly and write nothing unless the
  // maintainer explicitly opts in with source-maintenance mode.
  if (
    isAgentKitTemplateSourceRepo(consumer.packageJson?.name) &&
    flags.sourceMaintenance !== true
  ) {
    console.error(
      `wp setup: refusing to scaffold @webpresso/agent-kit's own repo (${consumer.repoRoot}).\n` +
        `  This repo is the source of the agent-surface templates; running setup here\n` +
        `  overwrites the canonical sources under catalog/ and the tracked .agent/.claude surfaces.\n` +
        `  To deliberately maintain agent-kit's own setup surfaces, re-run with --source-maintenance.`,
    )
    return EXIT_SETUP_FAIL
  }

  warnIfNonLocalCli(consumer.repoRoot)

  // Run the 5-point compatibility preflight before any scaffolders fire.
  const preflightResult = await runPreflight(consumer.repoRoot, flags.strict ?? false)
  if (preflightResult.warnings.length > 0) {
    if (!preflightResult.ok) {
      // strict mode: abort
      for (const warning of preflightResult.warnings) {
        console.error(`  preflight: ✗ ${warning}`)
      }
      console.error(
        `\nwp setup: aborting — ${preflightResult.warnings.length} compatibility check(s) failed.\n` +
          `See ${DOCS_URL}`,
      )
      return EXIT_SETUP_FAIL
    }
    // non-strict: warn and continue
    for (const warning of preflightResult.warnings) {
      console.warn(`  preflight: ⚠ ${warning}`)
    }
    console.warn(`  See ${DOCS_URL}`)
  } else {
    console.log(`  preflight: ✓ all 5 compatibility checks passed`)
  }

  const catalogDir = resolveCatalogDir()
  const packageRoot = dirname(catalogDir)
  const options: MergeOptions = {
    overwrite: flags.overwrite ?? false,
    dryRun: flags.dryRun ?? flags['dry-run'] ?? false,
  }

  const hooksRecoveryExit = await runHooksRecovery(consumer.repoRoot, flags, options)
  if (
    (flags.restoreHooks ?? flags['restore-hooks'] ?? false) ||
    (flags.disableHooks ?? flags['disable-hooks']) !== undefined
  ) {
    return hooksRecoveryExit
  }

  const acceptDefaults = flags.yes ?? true

  const existingConfig = readConfig(consumer.repoRoot)
  const presets = parsePresets(flags.with)
  let selectedHosts
  try {
    selectedHosts =
      flags.host === undefined
        ? (existingConfig?.hosts?.selected ?? parseAgentHosts(undefined))
        : parseAgentHosts(flags.host)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return EXIT_SETUP_FAIL
  }
  // Extract tier3 skills portion of --with (non-preset values)
  const withFlagWithoutPresets =
    flags.with
      ?.split(',')
      .map((s) => s.trim())
      .filter((s) => !(PRESETS as readonly string[]).includes(s))
      .join(',') || undefined

  let tier3Selection: string[]
  try {
    const selection = await resolveTier3Selection({
      withFlag: withFlagWithoutPresets,
      withoutFlag: flags.without,
      allFlag: flags.all,
      yesFlag: acceptDefaults,
      existing: existingConfig?.installed.tier3Skills,
      isTTY: Boolean(process.stdin.isTTY),
    })
    if (selection.aborted) {
      console.error('wp init: aborted by user.')
      return EXIT_USER_ABORT
    }
    tier3Selection = selection.selected
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return EXIT_SETUP_FAIL
  }

  console.log(`wp init: scaffolding into ${consumer.repoRoot}`)
  if (options.dryRun) console.log('  mode: DRY RUN (no writes)')
  if (options.overwrite)
    console.log('  mode: --overwrite (force full-file replacement for eligible managed files)')
  console.log(
    `  opt-in skills: ${tier3Selection.length > 0 ? tier3Selection.join(', ') : '(none)'}`,
  )

  // Unconditional: workspace config is always needed for cross-repo correlation.
  if (!options.dryRun) {
    const workspaceConfigResult = await scaffoldWorkspaceConfig()
    if (workspaceConfigResult.action === 'created') {
      console.log('  workspace config: ✓ created ~/.agent/workspace.yaml')
    }
  }

  try {
    const agentReport = scaffoldAgent({
      catalogDir,
      repoRoot: consumer.repoRoot,
      options,
    })

    // Wave-3: rules + skills are no longer copied. They flow through
    // consumer-owned `agent-rules/` / `agent-skills/` directories projected
    // into per-IDE surfaces by `runUnifiedSync` below. The scaffolders below
    // create those canonical directories with .gitkeep + README + .gitignore
    // patches so the source-of-truth surface exists before sync runs.
    const agentRulesReport = scaffoldAgentRules({
      cwd: consumer.repoRoot,
      dryRun: options.dryRun,
      overwrite: options.overwrite,
    })
    const agentSkillsReport = scaffoldAgentSkills({
      cwd: consumer.repoRoot,
      dryRun: options.dryRun,
      overwrite: options.overwrite,
    })
    const catalogIgnoreReport = scaffoldCatalogIgnore({
      cwd: consumer.repoRoot,
      catalogDir,
      dryRun: options.dryRun,
      overwrite: options.overwrite,
    })
    const generatedSurfaceIgnoreResult = patchGitignore(
      join(consumer.repoRoot, '.gitignore'),
      GENERATED_PATHS_BLOCK,
      { dryRun: options.dryRun, overwrite: true },
    )
    const generatedIndexCleanupResult = untrackGeneratedGitignoredPaths(
      consumer.repoRoot,
      GENERATED_PATHS_BLOCK,
      { dryRun: options.dryRun },
    )

    const postinstallPinResult = scaffoldPostinstallPin({
      repoRoot: consumer.repoRoot,
      options,
    })

    const baseKitResults = tier3Selection.includes('base-kit')
      ? scaffoldBaseKit({
          catalogDir,
          repoRoot: consumer.repoRoot,
          options,
        })
      : []

    const docsResults = scaffoldDocs({ catalogDir, repoRoot: consumer.repoRoot, options })
    const blueprintResults = scaffoldBlueprints({ repoRoot: consumer.repoRoot, options })

    const monorepoResults = scaffoldMonorepoNav({
      catalogDir,
      repoRoot: consumer.repoRoot,
      consumer,
      options,
    })

    // Unified sync runs before downstream scaffolders that read from
    // `.agent/skills/` (agent-hooks needs SKILL.md frontmatter to extract
    // hook entries). Rendered repo-local skills are written into the
    // consumer-owned `agent-skills/` tree first, then projected like every
    // other skill.
    const allowedSkillSlugs = new Set<string>([
      ...SHARED_FAVORITE_SKILLS,
      ...tier3Selection.filter(isProjectedManagedSkillSlug),
    ])
    assertManagedSkillSourcesPresent(catalogDir, [...allowedSkillSlugs])
    if (!options.dryRun) {
      runUnifiedSync({
        catalogDir: join(catalogDir, 'agent'),
        consumerRoot: consumer.repoRoot,
        kinds: ['rule', 'skill'],
        check: false,
        allowedSkillSlugs,
        hosts: selectedHosts,
      })
      // Remove leftover skill symlinks from dirs that are no longer active
      // projection targets (e.g. .claude/skills / .agents/skills once Claude and
      // Codex receive skills from their plugins) so skills are not double-shown.
      const activeSkillDirs = new Set(
        selectUnifiedConsumers(selectedHosts)
          .filter((unifiedConsumer) => unifiedConsumer.acceptsKind === 'skill')
          .map((unifiedConsumer) => unifiedConsumer.dir),
      )
      pruneInactiveSkillDirs(consumer.repoRoot, activeSkillDirs, false)
    }

    const blueprintsDir = inferBlueprintsDirOverride(consumer.repoRoot, existingConfig)
    const config: AgentkitConfig = mergeConfig(existingConfig, {
      ...defaultConfig(),
      installed: { tier3Skills: [...tier3Selection].toSorted() },
      hosts: {
        selected: selectedHosts,
        requiredCapabilities: [...REQUIRED_CORE_CAPABILITIES],
      },
      ...(blueprintsDir ? { blueprintsDir } : {}),
    })

    const previousHooksManifest = readHooksManifest(consumer.repoRoot)
    let agentHooksResult = await scaffoldAgentHooks({
      repoRoot: consumer.repoRoot,
      options,
      trustCodexHooks: false,
    })

    if (options.dryRun) {
      const proposedMap = buildProposedHooksMapFromSpecs(WP_HOOK_SPECS)
      const dryRunDiff = generateHooksDryRunDiff(
        join(consumer.repoRoot, '.claude', 'settings.json'),
        join(consumer.repoRoot, '.codex', 'hooks.json'),
        proposedMap,
        proposedMap,
      )
      stdout.write(dryRunDiff + '\n')
    } else {
      writeHooksManifest(
        consumer.repoRoot,
        agentHooksResult.manifest.claude,
        agentHooksResult.manifest.codex,
        agentHooksResult.manifest.vendorState,
      )
      printSetupReport(previousHooksManifest, agentHooksResult.manifest, stdout)
    }

    const auditHooksResult = scaffoldAuditHooks({ repoRoot: consumer.repoRoot, options })
    const opencodePluginResult = scaffoldOpencodePlugin({ repoRoot: consumer.repoRoot, options })
    let claudeRulesResults: MergeResult[] = []
    try {
      claudeRulesResults = scaffoldClaudeRules({ repoRoot: consumer.repoRoot, options })
    } catch (error) {
      if (error instanceof Error && error.message.includes('webpresso not found in node_modules')) {
        console.error(`wp init: setup failed — ${error.message}`)
        return EXIT_SETUP_FAIL
      }
      throw error
    }
    const subagentResults = scaffoldSubagents({ repoRoot: consumer.repoRoot, options })

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
      presetResults.push(scaffoldLoreCommits({ repoRoot: consumer.repoRoot, options }))
    }

    if (presets.includes('example-skill') && !options.dryRun) {
      await scaffoldExampleSkill(consumer.repoRoot)
      console.log('  example-skill: ✓ scaffolded .agent/skills/hello-webpresso/SKILL.md')
    }

    if (presets.includes('vision')) {
      // Only interview the operator when VISION.md is being scaffolded fresh
      // (preserves default non-interactive setup and existing-VISION non-clobber semantics).
      const visionPath = join(consumer.repoRoot, 'VISION.md')
      const visionAnswers = await maybeRunVisionInterview({
        repoName: basename(consumer.repoRoot),
        isTTY: Boolean(process.stdin.isTTY),
        yesFlag: acceptDefaults,
        visionExists: existsSync(visionPath),
      })
      const visionResult = scaffoldVision({
        catalogDir,
        repoRoot: consumer.repoRoot,
        options,
        answers: visionAnswers,
      })
      if (visionResult.action === 'created') {
        if (visionAnswers) {
          console.log('  vision: ✓ scaffolded VISION.md from your answers')
        } else {
          console.log(
            `  vision: ✓ scaffolded ${visionPath} (template stub — fill it in, then \`wp audit vision\`)`,
          )
        }
      }
      presetResults.push(visionResult)
    }

    // CI runners (GitHub Actions, etc.) set CI=true but don't have optional
    // developer-workstation tools (omx, gstack, rtk) available.
    // Failures from these installations must not fail the postinstall in that
    // context.
    const isCiEnvironment = process.env.CI === 'true' || process.env.CI === '1'

    if (isCiEnvironment) {
      console.log('  codex cli: - skipped (CI environment)')
    } else {
      const codexCliResult = ensureCodexCli({ options })
      switch (codexCliResult.kind) {
        case 'codex-cli-ok':
          console.log(codexCliResult.installed ? '  codex cli: ✓ installed' : '  codex cli: ✓')
          break
        case 'codex-cli-skipped-dry-run':
          console.log('  codex cli: skipped (--dry-run)')
          break
        case 'codex-cli-unavailable':
          console.warn(`  codex cli: ⚠ ${codexCliResult.hint}`)
          break
      }
    }

    let omxFailure: 'not-found' | 'spawn-failed' | null = null
    if (isCiEnvironment && presets.includes('omx')) {
      console.log('  omx setup: - skipped (CI environment)')
    } else if (presets.includes('omx')) {
      const omxResult = ensureOmx({
        repoRoot: consumer.repoRoot,
        options,
        scope: flags.project ? 'project' : 'user',
      })
      switch (omxResult.kind) {
        case 'omx-ok':
          console.log(
            omxResult.installed ? '  omx setup: ✓ installed + configured' : '  omx setup: ✓',
          )
          if (omxResult.removedProjectFiles.length > 0) {
            console.log(
              `  omx project-scope cleanup: ✓ removed ${omxResult.removedProjectFiles.length} tracked file(s)`,
            )
          }
          console.log(
            `  omx codex hooks: ${omxResult.codexGlobalHooks.repaired ? '✓ path-stable' : 'already path-stable'} ${omxResult.codexGlobalHooks.targetPath}`,
          )
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

    if (presets.includes('playwright-mcp') || presets.includes('omx')) {
      const playwrightMcpResult = ensureCodexPlaywrightMcp({ options })
      switch (playwrightMcpResult.kind) {
        case 'codex-playwright-mcp-written':
          console.log(`  codex playwright mcp: ✓ ${playwrightMcpResult.path}`)
          break
        case 'codex-playwright-mcp-unchanged':
          console.log(`  codex playwright mcp: already configured at ${playwrightMcpResult.path}`)
          break
        case 'codex-playwright-mcp-skipped-dry-run':
          console.log('  codex playwright mcp: skipped (--dry-run)')
          break
      }

      const claudePlaywrightMcpResult = ensureClaudePlaywrightMcp({
        options,
        repoRoot: consumer.repoRoot,
      })
      switch (claudePlaywrightMcpResult.kind) {
        case 'claude-playwright-mcp-written':
          console.log(`  claude playwright mcp: ✓ ${claudePlaywrightMcpResult.path}`)
          break
        case 'claude-playwright-mcp-unchanged':
          console.log(
            `  claude playwright mcp: already configured at ${claudePlaywrightMcpResult.path}`,
          )
          break
        case 'claude-playwright-mcp-skipped-dry-run':
          console.log('  claude playwright mcp: skipped (--dry-run)')
          break
        case 'claude-playwright-mcp-invalid-json':
          console.warn(
            `  claude playwright mcp: ⚠ ${claudePlaywrightMcpResult.path} is not valid JSON; left unchanged`,
          )
          break
      }
    }

    if (presets.includes('omx')) {
      agentHooksResult = await scaffoldAgentHooks({
        repoRoot: consumer.repoRoot,
        options,
        trustCodexHooks: false,
      })
    }

    if (isCiEnvironment && presets.includes('omc')) {
      console.log('  omc plugin: - skipped (CI environment)')
    } else if (presets.includes('omc')) {
      const omcResult = ensureOmc({
        options,
        scope: flags.project ? 'project' : 'user',
      })
      switch (omcResult.kind) {
        case 'omc-installed':
          console.log(
            `  omc plugin: ✓ ${omcResult.scope}-scope plugin ensured (${omcResult.pluginId}); next in Claude Code: ${OMC_SETUP_COMMAND} --${omcResult.scope === 'project' ? 'local' : 'global'}`,
          )
          break
        case 'omc-skipped-dry-run':
          console.log('  omc plugin: skipped (--dry-run)')
          break
        case 'omc-skipped-opt-out':
          console.log('  omc plugin: skipped (WP_SKIP_OMC=1)')
          break
        case 'omc-skipped-no-cli':
          console.warn(
            '  omc plugin: - skipped (claude not on PATH; OMC installs through Claude Code plugin marketplace only)',
          )
          break
        case 'omc-failed':
          console.warn(
            `  omc plugin: ⚠ ${omcResult.step} exited with ${omcResult.exitCode}; ` +
              `fallback: claude plugin marketplace add --scope ${omcResult.scope} https://github.com/Yeachan-Heo/oh-my-claudecode && ` +
              `claude plugin install --scope ${omcResult.scope} ${omcResult.pluginId}`,
          )
          break
      }
    }

    // OMX setup can repair legacy duplicate hook trust-state blocks by
    // clearing all `[hooks.state]` entries before rehydrating its own hooks.
    // Re-apply webpresso's trust hashes after that possible cleanup.
    await trustCodexWebpressoHooksForRepo({ repoRoot: consumer.repoRoot, options })
    await trustCodexPresetHooksForUser({ repoRoot: consumer.repoRoot, options })

    // Always upsert webpresso's MCP entry into the user's codex config when
    // an install root is discoverable. Codex's config.toml is user-global, so
    // we resolve to whatever absolute install path exists today (Claude
    // plugin / bun global / pnpm global / npm global) and write that.
    const webpressoMcpResult = ensureCodexWebpressoMcp({ options })
    switch (webpressoMcpResult.kind) {
      case 'codex-webpresso-mcp-written':
        console.log(
          `  codex webpresso mcp: ✓ ${webpressoMcpResult.path} → ${webpressoMcpResult.entryPath}`,
        )
        break
      case 'codex-webpresso-mcp-unchanged':
        console.log(`  codex webpresso mcp: already configured at ${webpressoMcpResult.path}`)
        break
      case 'codex-webpresso-mcp-skipped-dry-run':
        console.log('  codex webpresso mcp: skipped (--dry-run)')
        break
      case 'codex-webpresso-mcp-not-installed':
        console.log(
          `  codex webpresso mcp: ⚠ no install root found (checked ${webpressoMcpResult.checked.length} paths). Install @webpresso/agent-kit globally (\`bun add -g @webpresso/agent-kit\`) or via the Claude plugin to wire up codex MCP.`,
        )
        break
    }

    // Context7 auth remains provider-owned: setup writes only the Codex
    // env-header mapping, while `with-secrets -- codex` injects the actual
    // CONTEXT7_API_KEY from the selected secret manager at runtime.
    const context7McpResult = ensureCodexContext7Mcp({ options })
    switch (context7McpResult.action) {
      case 'created':
      case 'overwritten':
        console.log(
          `  codex context7 mcp: ✓ ${context7McpResult.targetPath} (uses ${CONTEXT7_API_KEY_ENV} from with-secrets)`,
        )
        break
      case 'identical':
        console.log(
          `  codex context7 mcp: already configured at ${context7McpResult.targetPath} (launch Codex with: with-secrets -- codex)`,
        )
        break
      case 'skipped-dry':
        console.log('  codex context7 mcp: skipped (--dry-run)')
        break
    }

    // Claude Code expands `${CONTEXT7_API_KEY}` inside `.mcp.json` headers at
    // runtime. As with Codex, setup writes only the variable reference and the
    // selected secret provider injects the value when Claude is launched via
    // `with-secrets -- claude`.
    const claudeContext7McpResult = ensureClaudeContext7Mcp({
      options,
      repoRoot: consumer.repoRoot,
    })
    switch (claudeContext7McpResult.kind) {
      case 'claude-context7-mcp-written':
        console.log(
          `  claude context7 mcp: ✓ ${claudeContext7McpResult.path} (uses ${CONTEXT7_API_KEY_ENV} from with-secrets)`,
        )
        break
      case 'claude-context7-mcp-unchanged':
        console.log(
          `  claude context7 mcp: already configured at ${claudeContext7McpResult.path} (launch Claude with: with-secrets -- claude)`,
        )
        break
      case 'claude-context7-mcp-skipped-dry-run':
        console.log('  claude context7 mcp: skipped (--dry-run)')
        break
      case 'claude-context7-mcp-invalid-json':
        console.warn(
          `  claude context7 mcp: ⚠ ${claudeContext7McpResult.path} is not valid JSON; left unchanged`,
        )
        break
    }

    // Self-update the globally-distributed agent-kit install that backs PATH
    // `wp`, mirroring omx/omc/codex/claude. Non-fatal: a failed refresh never
    // fails consumer setup, and it skips cleanly in explicit source mode, on
    // `WP_SKIP_AUTO_INSTALL=1`, and in CI.
    if (isCiEnvironment) {
      console.log('  agent-kit global: - skipped (CI environment)')
    } else {
      const agentKitGlobalResult = ensureAgentKitGlobal({ options })
      switch (agentKitGlobalResult.kind) {
        case 'agent-kit-global-updated':
          console.log('  agent-kit global: ✓ refreshed via vp install -g')
          break
        case 'agent-kit-global-skipped-dry-run':
          console.log('  agent-kit global: skipped (--dry-run)')
          break
        case 'agent-kit-global-skipped-opt-out':
          console.log('  agent-kit global: skipped (WP_SKIP_AUTO_INSTALL=1)')
          break
        case 'agent-kit-global-skipped-source-mode':
          console.log('  agent-kit global: - skipped (WP_FORCE_SOURCE=1 source mode)')
          break
        case 'agent-kit-global-skipped-no-vp':
          console.warn(`  agent-kit global: ⚠ ${agentKitGlobalResult.hint}`)
          break
        case 'agent-kit-global-failed':
          console.warn(
            `  agent-kit global: ⚠ \`${agentKitGlobalResult.command.join(' ')}\` exited with ${agentKitGlobalResult.exitCode}; ` +
              'the existing global binary is unchanged. Re-run `wp setup` once the registry is reachable.',
          )
          break
        case 'agent-kit-global-repair-failed':
          console.warn(
            `  agent-kit global: ⚠ root bin/wp launcher repair failed (${agentKitGlobalResult.reason}); ` +
              'the global install may be inconsistent until it is rebuilt or reinstalled.',
          )
          break
      }
    }

    const claudePluginResult = ensureClaudeCodeUserPlugin({
      options,
      packageRoot,
    })
    switch (claudePluginResult.kind) {
      case 'claude-plugin-installed':
        console.log(
          `  claude plugin: ✓ user-scope marketplace + plugin ensured (${claudePluginResult.pluginId})`,
        )
        break
      case 'claude-plugin-skipped-dry-run':
        console.log('  claude plugin: skipped (--dry-run)')
        break
      case 'claude-plugin-skipped-opt-out':
        console.log('  claude plugin: skipped (WP_SKIP_CLAUDE_PLUGIN=1)')
        break
      case 'claude-plugin-skipped-no-cli':
        console.log('  claude plugin: - skipped (claude not on PATH)')
        break
      case 'claude-plugin-unavailable':
        console.log('  claude plugin: - skipped (plugin manifest unavailable in this install)')
        break
      case 'claude-plugin-failed':
        console.warn(
          `  claude plugin: ⚠ ${claudePluginResult.step} exited with ${claudePluginResult.exitCode}; ` +
            `fallback: claude plugin marketplace add --scope user ${claudePluginResult.packageRoot} && ` +
            `claude plugin install --scope user ${claudePluginResult.pluginId}`,
        )
        break
    }

    if (selectedHosts.includes('codex') && !isCiEnvironment) {
      const codexPluginResult = ensureCodexUserPlugin({ options, packageRoot })
      switch (codexPluginResult.kind) {
        case 'codex-plugin-installed':
          console.log(
            `  codex plugin: ✓ marketplace + plugin ensured (${codexPluginResult.pluginId}) — restart Codex to load skills`,
          )
          break
        case 'codex-plugin-skipped-dry-run':
          console.log('  codex plugin: skipped (--dry-run)')
          break
        case 'codex-plugin-skipped-opt-out':
          console.log('  codex plugin: skipped (WP_SKIP_CODEX_PLUGIN=1)')
          break
        case 'codex-plugin-skipped-no-cli':
          console.log('  codex plugin: - skipped (codex not on PATH)')
          break
        case 'codex-plugin-unavailable':
          console.log('  codex plugin: - skipped (plugin manifest unavailable in this install)')
          break
        case 'codex-plugin-failed':
          console.warn(
            `  codex plugin: ⚠ ${codexPluginResult.step} exited with ${codexPluginResult.exitCode}; ` +
              `fallback: codex plugin marketplace add ${codexPluginResult.stagingRoot} && ` +
              `codex plugin add ${codexPluginResult.pluginId}`,
          )
          break
      }
    }

    let gstackFailure: 'clone-failed' | 'pull-failed' | 'setup-failed' | null = null
    if (process.env.WP_SKIP_GSTACK === '1') {
      console.warn(
        '  gstack: ⚠ WP_SKIP_GSTACK=1 — skipping. Most consumer repos treat gstack as a hard prerequisite.',
      )
    } else if (isCiEnvironment && presets.includes('gstack')) {
      console.log('  gstack: - skipped (CI environment)')
    } else if (presets.includes('gstack')) {
      const gstackResult = await ensureGstack({ repoRoot: consumer.repoRoot, options })
      switch (gstackResult.kind) {
        case 'gstack-installed':
          console.log(`  gstack: ✓ installed at ${gstackResult.root}`)
          switch (gstackResult.codex.kind) {
            case 'gstack-codex-installed':
              console.log(`  gstack (codex): ✓ installed at ${gstackResult.codex.skillsRoot}`)
              break
            case 'gstack-codex-updated':
              console.log(`  gstack (codex): ✓ updated at ${gstackResult.codex.skillsRoot}`)
              break
            case 'gstack-codex-already-configured':
              console.log(
                `  gstack (codex): already configured at ${gstackResult.codex.skillsRoot}`,
              )
              break
            case 'gstack-codex-skipped':
              console.log(`  gstack (codex): - skipped (${gstackResult.codex.reason})`)
              break
          }
          break
        case 'gstack-updated':
          console.log(`  gstack: ✓ updated at ${gstackResult.root}`)
          switch (gstackResult.codex.kind) {
            case 'gstack-codex-installed':
              console.log(`  gstack (codex): ✓ installed at ${gstackResult.codex.skillsRoot}`)
              break
            case 'gstack-codex-updated':
              console.log(`  gstack (codex): ✓ updated at ${gstackResult.codex.skillsRoot}`)
              break
            case 'gstack-codex-already-configured':
              console.log(
                `  gstack (codex): already configured at ${gstackResult.codex.skillsRoot}`,
              )
              break
            case 'gstack-codex-skipped':
              console.log(`  gstack (codex): - skipped (${gstackResult.codex.reason})`)
              break
          }
          break
        case 'gstack-already-configured':
          console.log(
            `  gstack: already configured at ${gstackResult.root} (set WP_GSTACK_REFRESH=1 to refresh)`,
          )
          switch (gstackResult.codex.kind) {
            case 'gstack-codex-installed':
              console.log(`  gstack (codex): ✓ installed at ${gstackResult.codex.skillsRoot}`)
              break
            case 'gstack-codex-updated':
              console.log(`  gstack (codex): ✓ updated at ${gstackResult.codex.skillsRoot}`)
              break
            case 'gstack-codex-already-configured':
              console.log(
                `  gstack (codex): already configured at ${gstackResult.codex.skillsRoot}`,
              )
              break
            case 'gstack-codex-skipped':
              console.log(`  gstack (codex): - skipped (${gstackResult.codex.reason})`)
              break
          }
          break
        case 'gstack-skipped-dry-run':
          console.log('  gstack: skipped (--dry-run)')
          break
        case 'gstack-clone-failed':
          console.error(
            gstackResult.reason === 'signal-interrupted'
              ? `  gstack: ✗ interrupted while running git clone`
              : gstackResult.reason === 'inactivity-timeout'
                ? `  gstack: ✗ git clone timed out after inactivity`
                : `  gstack: ✗ git clone exited with ${gstackResult.exitCode}`,
          )
          console.error(`  gstack: log ${gstackResult.logPath}`)
          gstackFailure = 'clone-failed'
          break
        case 'gstack-pull-failed':
          console.error(
            gstackResult.reason === 'signal-interrupted'
              ? `  gstack: ✗ interrupted while running git pull`
              : gstackResult.reason === 'inactivity-timeout'
                ? `  gstack: ✗ git pull timed out after inactivity`
                : `  gstack: ✗ git pull exited with ${gstackResult.exitCode}`,
          )
          console.error(`  gstack: log ${gstackResult.logPath}`)
          gstackFailure = 'pull-failed'
          break
        case 'gstack-setup-failed':
          console.error(
            gstackResult.reason === 'signal-interrupted'
              ? `  gstack: ✗ interrupted while running ./setup ${gstackResult.command}`
              : gstackResult.reason === 'inactivity-timeout'
                ? `  gstack: ✗ ./setup ${gstackResult.command} timed out after inactivity`
                : `  gstack: ✗ ./setup ${gstackResult.command} exited with ${gstackResult.exitCode}`,
          )
          console.error(`  gstack: log ${gstackResult.logPath}`)
          gstackFailure = 'setup-failed'
          break
      }
    }

    let rtkFailure: 'not-found' | 'init-failed' | null = null
    if (process.env.WP_SKIP_RTK === '1') {
      console.warn(
        '  rtk: ⚠ WP_SKIP_RTK=1 — skipping. RTK provides shell-tool output filtering for git/gh/kubectl/etc.',
      )
    } else if (isCiEnvironment && presets.includes('rtk')) {
      console.log('  rtk: - skipped (CI environment)')
    } else if (presets.includes('rtk')) {
      if (!options.dryRun) {
        mkdirSync(join(consumer.repoRoot, '.agent'), { recursive: true })
        writeFileSync(
          join(consumer.repoRoot, RTK_REQUESTED_MARKER),
          'managed by wp setup (default-on)\n',
        )
      }
      const rtkResult = ensureRtk({ repoRoot: consumer.repoRoot, options })
      switch (rtkResult.kind) {
        case 'rtk-ok':
          console.log(rtkResult.installed ? '  rtk: ✓ installed + configured' : '  rtk: ✓')
          break
        case 'rtk-skipped-dry-run':
          console.log('  rtk: skipped (--dry-run)')
          break
        case 'rtk-not-found':
          console.error(`  rtk: ✗ ${rtkResult.hint}`)
          rtkFailure = 'not-found'
          break
        case 'rtk-init-failed':
          console.error(`  rtk: ✗ rtk init exited with ${rtkResult.exitCode}`)
          rtkFailure = 'init-failed'
          break
      }
    }

    const all = [
      ...agentReport.results,
      ...agentRulesReport.results,
      ...agentSkillsReport.results,
      ...catalogIgnoreReport.results,
      generatedSurfaceIgnoreResult,
      postinstallPinResult,
      ...baseKitResults,
      ...docsResults,
      ...blueprintResults,
      ...monorepoResults,
      ...(agentsMdResult ? [agentsMdResult] : []),
      agentHooksResult.claude,
      agentHooksResult.codex,
      agentHooksResult.claudeUser,
      {
        targetPath: auditHooksResult.preCommitPath,
        action: auditHooksResult.action === 'appended' ? 'overwritten' : auditHooksResult.action,
      } satisfies MergeResult,
      opencodePluginResult,
      ...claudeRulesResults,
      ...subagentResults,
      ...presetResults,
    ]
    const summary = summarizeResults(all)

    console.log('\nScaffold summary:')
    console.log(`  created:         ${summary.created}`)
    console.log(`  identical:       ${summary.identical}`)
    console.log(`  overwritten:     ${summary.overwritten}`)
    console.log(`  drifted:         ${summary.drifted}`)
    if (options.dryRun) console.log(`  would-change:    ${summary['skipped-dry']}`)
    if (generatedIndexCleanupResult.kind === 'ok') {
      console.log(
        `  git index cleanup: ${generatedIndexCleanupResult.removedPaths.length} untracked`,
      )
    } else if (generatedIndexCleanupResult.kind === 'failed') {
      console.warn(
        `  git index cleanup: failed (git rm --cached exited ${generatedIndexCleanupResult.exitCode})`,
      )
      if (generatedIndexCleanupResult.stderr.length > 0) {
        console.warn(`  git index cleanup stderr: ${generatedIndexCleanupResult.stderr}`)
      }
    }

    if (tier3Selection.includes('base-kit')) {
      const qualityTargets = new Set(BASE_KIT_QUALITY_TARGETS)
      const qualityResults = baseKitResults.filter((result) =>
        qualityTargets.has(relative(consumer.repoRoot, result.targetPath).replaceAll('\\', '/')),
      )
      const qualityCreated = qualityResults.filter((result) => result.action === 'created').length
      const qualityPreserved = qualityResults.filter(
        (result) => result.action === 'identical',
      ).length
      const qualityDryRun = qualityResults.filter(
        (result) => result.action === 'skipped-dry',
      ).length
      console.log(
        `  repo quality scaffold: ${options.dryRun ? `${qualityDryRun} would be created` : `${qualityCreated} created, ${qualityPreserved} preserved`}`,
      )
    }

    if (summary.drifted > 0) {
      console.log(
        '\n  Note: some consumer-owned files exist with different content and were left unchanged.\n' +
          '  Review the drift or re-run with `--overwrite` to force eligible managed files.',
      )
    }

    if (!options.dryRun) {
      const visibilityAudit = auditHostSkillVisibility({
        repoRoot: consumer.repoRoot,
        hosts: selectedHosts,
        requiredCapabilities: [...REQUIRED_CORE_CAPABILITIES],
      })
      config.hosts = {
        selected: selectedHosts,
        requiredCapabilities: [...REQUIRED_CORE_CAPABILITIES],
        visibility: serializeHostVisibility(visibilityAudit),
      }
      writeConfig(consumer.repoRoot, config)

      console.log('\nHost skill visibility:')
      if (visibilityAudit.selectedHosts.length === 0) {
        console.log('  hosts: - skipped (--host none)')
      } else {
        for (const line of summarizeHostVisibility(consumer.repoRoot, visibilityAudit)) {
          console.log(line)
        }
      }

      console.log(
        `\n${formatHostSetupSurfaceVisibility({ repoRoot: consumer.repoRoot, packageRoot })}`,
      )

      const missing = visibilityAudit.results.filter((result) => result.status === 'not-visible')
      if (missing.length > 0) {
        if (isCiEnvironment) {
          // CI runners don't have skills installed (no claude, no ~/.claude/skills/).
          // Skill visibility is a developer-workstation concern; skip the hard gate.
          console.log(
            `  host visibility: - skipped hard gate (CI environment, ${missing.length} capability/host pair(s) not visible)`,
          )
        } else if (process.env.WP_SETUP_STRICT_HOST_VISIBILITY === '1') {
          console.error(
            `\nwp setup: host visibility check failed for ${missing
              .map((result) => `${result.host}/${result.capability}`)
              .join(', ')}`,
          )
          return EXIT_SETUP_FAIL
        } else {
          console.warn(
            `  host visibility: ⚠ ${missing
              .map((result) => `${result.host}/${result.capability}`)
              .join(', ')} not visible until the selected host skill roots are installed/reloaded`,
          )
        }
      }
    } else {
      console.log(
        `\n${formatHostSetupSurfaceVisibility({ repoRoot: consumer.repoRoot, packageRoot })}`,
      )
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

    printRuntimeContractGuidance(
      options.dryRun
        ? consumer.packageJson
        : (readPackageJsonSafe(consumer.repoRoot) ?? consumer.packageJson),
    )

    console.log('\nwp init: setup phases finished.')
    if (omxFailure === 'not-found') return EXIT_SETUP_FAIL
    if (omxFailure === 'spawn-failed') return EXIT_WRITE_FAIL
    if (gstackFailure === 'clone-failed') return EXIT_WRITE_FAIL
    if (gstackFailure === 'pull-failed') return EXIT_WRITE_FAIL
    if (gstackFailure === 'setup-failed') return EXIT_WRITE_FAIL
    if (rtkFailure === 'not-found') return EXIT_SETUP_FAIL
    if (rtkFailure === 'init-failed') return EXIT_WRITE_FAIL

    if (isTelemetryEnabled(process.env as Record<string, string | undefined>)) {
      const payload = {
        event: 'setup-complete' as const,
        durationMs: Date.now() - startMs,
        webpressoVersion: readPackageVersion(import.meta.url),
        os: process.platform,
        nodeVersion: process.version,
      }
      await Promise.race([reportTthw(payload), new Promise<void>((r) => setTimeout(r, 100))])
    }

    // Lane-4 framing — printed once on every successful completion so users
    // know which tool owns which part of the dev-workflow surface.
    console.log(
      [
        '',
        'Ownership lanes:',
        '  Lane 1 wp_*   blueprint · audit · quality',
        '  Lane 2 rtk    shell-tool token filtering',
        '  Lane 3 gstack interactive workflows',
      ].join('\n'),
    )

    // Next-steps block — only when not in dry-run (real writes happened).
    if (!options.dryRun) {
      console.log(
        [
          '',
          '✅ Setup complete for the verified phases above.',
          '',
          '  Next: wp hooks doctor',
          '        Then ask Claude or Codex to run `wp_audit(kind="docs-frontmatter")`.',
          '        wp gain          # token savings after your first session',
        ].join('\n'),
      )
    }

    return EXIT_SUCCESS
  } catch (error) {
    if (error instanceof Error && /catalogDir does not exist/.test(error.message)) {
      console.error(
        'wp init: webpresso not installed in node_modules. ' + 'Run `vp install` first.',
      )
      return EXIT_SETUP_FAIL
    }
    console.error(
      `wp init: write failed — ${error instanceof Error ? error.message : String(error)}`,
    )
    return EXIT_WRITE_FAIL
  }
}

export type InitCommandName = 'setup' | 'init'

export function registerInitCommand(cli: CAC, commandName: InitCommandName = 'init'): void {
  const description =
    commandName === 'setup'
      ? 'Scaffold webpresso catalog into the current repo'
      : 'Compatibility alias for wp setup'

  // Help text is data-driven so adding a preset (PRESETS) automatically
  // updates --help. Prevents the docs/code drift we discovered when
  // omx + gstack landed without surfacing in --help.
  const withHelp =
    `Comma-separated opt-in skills and/or presets to install ` +
    `(non-interactive). Presets: ${PRESETS.join(', ')}. ` +
    `Opt-in skills are listed by 'wp skill list'.`
  const withoutHelp =
    `Comma-separated opt-in skills to opt out of. ` + `base-kit is default-on unless passed here.`

  cli
    .command(commandName, description)
    .option('--with <skills>', withHelp)
    .option('--without <skills>', withoutHelp)
    .option('--host <hosts>', 'Comma-separated host targets: codex, claude, opencode, all, none')
    .option('--all', 'Install shared favorites plus every opt-in skill')
    .option(
      '--overwrite',
      'Force full-file replacement for eligible managed files (default: reconcile owned content and preserve divergent consumer files)',
    )
    .option('--dry-run', 'Show what would change without writing anything')
    .option(
      '--restore-hooks',
      'Restore managed Claude/Codex hook config from .webpresso/hooks-manifest.json',
    )
    .option('--disable-hooks <vendor>', 'Disable managed hooks for claude, codex, or all')
    .option('--yes', 'Accept defaults, skip interactive prompts (default behavior)')
    .option('--cwd <dir>', 'Working tree to scaffold into (default: process.cwd())')
    .option('--strict', 'Abort if any compatibility check fails (default: warn and continue)')
    .option('--project', 'Configure OMX/OMC in project scope instead of the default user scope')
    .option(
      '--source-maintenance',
      "Override the self-repo guard for @webpresso/agent-kit's own setup-surface maintenance (maintainers only)",
    )
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
