import type { CAC } from 'cac'

/**
 * `ak setup` / `ak init` — scaffolds the agent-kit catalog into a consumer repo.
 *
 * Idempotent: re-runs reconcile against `.agent-kitrc.json`.
 * Safe-by-default: if a target file exists with different content, writes
 * to `<name>.new` unless `--overwrite` is passed.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { isTelemetryEnabled, reportTthw } from '#telemetry/setup-tthw'
import { readPackageVersion } from '#cli/utils'
import { resolveBlueprintRoot } from '#utils/blueprint-root'

import { runUnifiedSync } from '#symlinker/unified-sync'
import {
  type AgentkitConfig,
  defaultConfig,
  mergeConfig,
  readConfig,
  writeConfig,
} from './config.js'
import { detectConsumer, warnIfNonLocalCli } from './detect-consumer.js'
import { runPreflight, DOCS_URL } from './preflight.js'
import { type MergeOptions, type MergeResult, summarizeResults } from './merge.js'
import { resolveTier3Selection } from './prompts.js'
import { scaffoldAgent, RENDERED_SKILLS, TIER1_SKILLS, TIER2_SKILLS } from './scaffold-agent.js'
import { scaffoldAgentRules } from './scaffold-agent-rules.js'
import { scaffoldAgentSkills } from './scaffold-agent-skills.js'
import { scaffoldAgentsMd } from './scaffold-agents-md.js'
import { scaffoldBlueprints } from './scaffold-blueprints.js'
import { scaffoldDocs } from './scaffold-docs.js'
import { scaffoldBaseKit } from './scaffold-base-kit.js'
import { scaffoldMonorepoNav } from './scaffold-monorepo-nav.js'
import {
  REQUIRED_CORE_CAPABILITIES,
  auditHostSkillVisibility,
  parseAgentHosts,
  serializeHostVisibility,
  summarizeHostVisibility,
} from './host-visibility.js'
import { scaffoldAgentHooks } from './scaffolders/agent-hooks/index.js'
import { scaffoldAuditHooks } from './scaffolders/audit-hooks/index.js'
import { scaffoldClaudeRules } from './scaffolders/claude-rules/index.js'
import { ensureCodexAgentKitMcp, ensureCodexPlaywrightMcp } from './scaffolders/codex-mcp/index.js'
import { scaffoldExampleSkill } from './scaffolders/example-skill/index.js'
import { ensureGstack } from './scaffolders/gstack/index.js'
import { scaffoldLoreCommits } from './scaffolders/lore-commits/index.js'
import { ensureOmx } from './scaffolders/omx/index.js'
import { ensureContextMode } from './scaffolders/context-mode/index.js'
import { scaffoldOpencodePlugin } from './scaffolders/opencode-plugin/index.js'
import { ensureRtk } from './scaffolders/rtk/index.js'
import { checkRuntimes } from './scaffolders/runtime-check/index.js'
import { scaffoldSubagents } from './scaffolders/subagents/index.js'
import { maybeRunVisionInterview } from './scaffolders/vision/interview.js'
import { scaffoldVision } from './scaffolders/vision/index.js'
import { scaffoldWorkspaceConfig } from './scaffolders/workspace-config/index.js'

const PRESETS = [
  'context-mode',
  'example-skill',
  'gstack',
  'lore-commits',
  'omx',
  'playwright-mcp',
  'rtk',
  'vision',
] as const
type Preset = (typeof PRESETS)[number]
const DEFAULT_PRESETS: readonly Preset[] = ['context-mode', 'omx', 'gstack', 'vision', 'rtk']
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
  host?: string
  all?: boolean
  overwrite?: boolean
  'dry-run'?: boolean
  yes?: boolean
  cwd?: string
  strict?: boolean
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

export async function runInit(flags: InitFlags): Promise<number> {
  const startMs = Date.now()
  const cwd = flags.cwd ?? process.cwd()
  const consumer = detectConsumer(cwd)
  if (!consumer) {
    console.error(
      `ak init: could not find a git repo (walked up from ${cwd}).\n` +
        `Run \`git init\` first, or pass --cwd pointing at a git working tree.`,
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
        `\nak setup: aborting — ${preflightResult.warnings.length} compatibility check(s) failed.\n` +
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
  const options: MergeOptions = {
    overwrite: flags.overwrite ?? false,
    dryRun: flags['dry-run'] ?? false,
  }

  const existingConfig = readConfig(consumer.repoRoot)
  const presets = parsePresets(flags.with)
  let selectedHosts
  try {
    selectedHosts = parseAgentHosts(flags.host)
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

    // Unified sync runs before downstream scaffolders that read from
    // `.agent/skills/` (agent-hooks needs SKILL.md frontmatter to extract
    // hook entries). Rendered repo-local skills are written into the
    // consumer-owned `agent-skills/` tree first, then projected like every
    // other skill.
    const allowedSkillSlugs = new Set<string>([
      ...TIER1_SKILLS,
      ...TIER2_SKILLS,
      ...RENDERED_SKILLS,
      ...tier3Selection,
    ])
    if (!options.dryRun) {
      runUnifiedSync({
        catalogDir: join(catalogDir, 'agent'),
        consumerRoot: consumer.repoRoot,
        kinds: ['rule', 'skill'],
        check: false,
        allowedSkillSlugs,
      })
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

    const agentHooksResult = scaffoldAgentHooks({ repoRoot: consumer.repoRoot, options })
    const auditHooksResult = scaffoldAuditHooks({ repoRoot: consumer.repoRoot, options })
    const opencodePluginResult = scaffoldOpencodePlugin({ repoRoot: consumer.repoRoot, options })
    let claudeRulesResults: MergeResult[] = []
    try {
      claudeRulesResults = scaffoldClaudeRules({ repoRoot: consumer.repoRoot, options })
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('@webpresso/agent-kit not found in node_modules')
      ) {
        console.error(`ak init: setup failed — ${error.message}`)
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
      // (preserves --yes, non-TTY, and existing-VISION non-clobber semantics).
      const visionPath = join(consumer.repoRoot, 'VISION.md')
      const visionAnswers = await maybeRunVisionInterview({
        repoName: basename(consumer.repoRoot),
        isTTY: Boolean(process.stdin.isTTY),
        yesFlag: flags.yes,
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
            `  vision: ✓ scaffolded ${visionPath} (template stub — fill it in, then \`ak audit vision\`)`,
          )
        }
      }
      presetResults.push(visionResult)
    }

    if (presets.includes('context-mode')) {
      const contextModeResult = ensureContextMode({ repoRoot: consumer.repoRoot, options })
      console.log(
        `  context-mode codex mcp: ${contextModeResult.codexMcp.action === 'identical' ? 'already configured' : contextModeResult.codexMcp.action === 'skipped-dry' ? 'skipped (--dry-run)' : '✓'} ${contextModeResult.codexMcp.targetPath}`,
      )
      console.log(
        `  context-mode codex hooks: ${contextModeResult.codexHooks.action === 'identical' ? 'already configured' : contextModeResult.codexHooks.action === 'skipped-dry' ? 'skipped (--dry-run)' : '✓'} ${contextModeResult.codexHooks.targetPath}`,
      )
      console.log(
        `  context-mode opencode config: ${contextModeResult.opencodeConfig.action === 'identical' ? 'already configured' : contextModeResult.opencodeConfig.action === 'skipped-dry' ? 'skipped (--dry-run)' : '✓'} ${contextModeResult.opencodeConfig.targetPath}`,
      )
    }

    let omxFailure: 'not-found' | 'spawn-failed' | null = null
    if (presets.includes('omx')) {
      const omxResult = ensureOmx({ repoRoot: consumer.repoRoot, options })
      switch (omxResult.kind) {
        case 'omx-ok':
          console.log(
            omxResult.installed ? '  omx setup: ✓ installed + configured' : '  omx setup: ✓',
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
    }

    // Always upsert agent-kit's MCP entry into the user's codex config when
    // an install root is discoverable. Codex's config.toml is user-global, so
    // we resolve to whatever absolute install path exists today (Claude
    // plugin / bun global / pnpm global / npm global) and write that.
    const agentKitMcpResult = ensureCodexAgentKitMcp({ options })
    switch (agentKitMcpResult.kind) {
      case 'codex-agent-kit-mcp-written':
        console.log(
          `  codex agent-kit mcp: ✓ ${agentKitMcpResult.path} → ${agentKitMcpResult.entryPath}`,
        )
        break
      case 'codex-agent-kit-mcp-unchanged':
        console.log(`  codex agent-kit mcp: already configured at ${agentKitMcpResult.path}`)
        break
      case 'codex-agent-kit-mcp-skipped-dry-run':
        console.log('  codex agent-kit mcp: skipped (--dry-run)')
        break
      case 'codex-agent-kit-mcp-not-installed':
        console.log(
          `  codex agent-kit mcp: ⚠ no install root found (checked ${agentKitMcpResult.checked.length} paths). Install agent-kit globally (\`bun add -g @webpresso/agent-kit\`) or via the Claude plugin to wire up codex MCP.`,
        )
        break
    }

    let gstackFailure: 'clone-failed' | 'pull-failed' | 'setup-failed' | null = null
    if (process.env.AK_SKIP_GSTACK === '1') {
      console.warn(
        '  gstack: ⚠ AK_SKIP_GSTACK=1 — skipping. Most consumer repos treat gstack as a hard prerequisite.',
      )
    } else if (presets.includes('gstack')) {
      const gstackResult = ensureGstack({ repoRoot: consumer.repoRoot, options })
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
            case 'gstack-codex-skipped':
              console.log(`  gstack (codex): - skipped (${gstackResult.codex.reason})`)
              break
          }
          break
        case 'gstack-skipped-dry-run':
          console.log('  gstack: skipped (--dry-run)')
          break
        case 'gstack-clone-failed':
          console.error(`  gstack: ✗ git clone exited with ${gstackResult.exitCode}`)
          gstackFailure = 'clone-failed'
          break
        case 'gstack-pull-failed':
          console.error(`  gstack: ✗ git pull exited with ${gstackResult.exitCode}`)
          gstackFailure = 'pull-failed'
          break
        case 'gstack-setup-failed':
          console.error(
            `  gstack: ✗ ./setup ${gstackResult.command} exited with ${gstackResult.exitCode}`,
          )
          gstackFailure = 'setup-failed'
          break
      }
    }

    let rtkFailure: 'not-found' | 'init-failed' | null = null
    if (process.env.AK_SKIP_RTK === '1') {
      console.warn(
        '  rtk: ⚠ AK_SKIP_RTK=1 — skipping. RTK provides shell-tool output filtering for git/gh/kubectl/etc.',
      )
    } else if (presets.includes('rtk')) {
      if (!options.dryRun) {
        mkdirSync(join(consumer.repoRoot, '.agent'), { recursive: true })
        writeFileSync(
          join(consumer.repoRoot, RTK_REQUESTED_MARKER),
          'managed by ak setup (default-on)\n',
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
      ...baseKitResults,
      ...docsResults,
      ...blueprintResults,
      ...monorepoResults,
      ...(agentsMdResult ? [agentsMdResult] : []),
      agentHooksResult.claude,
      agentHooksResult.codex,
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
    console.log(`  sidecar (.new):  ${summary['sidecar-written']}`)
    if (options.dryRun) console.log(`  would-change:    ${summary['skipped-dry']}`)

    if (summary['sidecar-written'] > 0) {
      console.log(
        '\n  Note: some files exist with different content. New versions were\n' +
          '  written with a `.new` suffix — diff and merge manually, or re-run\n' +
          '  with `--overwrite` to replace them.',
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
      for (const line of summarizeHostVisibility(consumer.repoRoot, visibilityAudit)) {
        console.log(line)
      }

      const missing = visibilityAudit.results.filter((result) => result.status === 'not-visible')
      if (missing.length > 0) {
        console.error(
          `\nak setup: host visibility check failed for ${missing
            .map((result) => `${result.host}/${result.capability}`)
            .join(', ')}`,
        )
        return EXIT_SETUP_FAIL
      }
    }

    // Surface claude plugin install hint if agent-kit is in node_modules
    try {
      const pluginJsonPath = join(
        consumer.repoRoot,
        'node_modules',
        '@webpresso',
        'agent-kit',
        '.claude-plugin',
        'plugin.json',
      )
      if (existsSync(pluginJsonPath)) {
        console.log(
          '\nClaude Code plugin: to enable /pll, /verify, and other skills,\n' +
            '  run: claude --plugin-dir ' +
            join(consumer.repoRoot, 'node_modules', '@webpresso', 'agent-kit') +
            '\n' +
            '  (or start Claude Code from this directory with the --plugin-dir flag,\n' +
            '   then add it permanently via: claude plugin marketplace add ...\n' +
            '   see docs/presets.md for the full procedure)',
        )
      }
    } catch {
      // non-fatal — plugin hint is best-effort
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
    if (gstackFailure === 'pull-failed') return EXIT_WRITE_FAIL
    if (gstackFailure === 'setup-failed') return EXIT_WRITE_FAIL
    if (rtkFailure === 'not-found') return EXIT_SETUP_FAIL
    if (rtkFailure === 'init-failed') return EXIT_WRITE_FAIL

    if (isTelemetryEnabled(process.env as Record<string, string | undefined>)) {
      const payload = {
        event: 'setup-complete' as const,
        durationMs: Date.now() - startMs,
        agentKitVersion: readPackageVersion(import.meta.url),
        os: process.platform,
        nodeVersion: process.version,
      }
      await Promise.race([reportTthw(payload), delay(100)])
    }

    // Lane-4 framing — printed once on every successful completion so users
    // know which tool owns which part of the dev-workflow surface.
    console.log(
      [
        '',
        'Ownership lanes:',
        '  Lane 1 ak_*   blueprint · audit · quality',
        '  Lane 2 ctx_*  context-mode (context reduction)',
        '  Lane 3 rtk    shell-tool token filtering',
        '  Lane 4 gstack interactive workflows',
      ].join('\n'),
    )

    // Next-steps block — only when not in dry-run (real writes happened).
    if (!options.dryRun) {
      console.log(
        [
          '',
          '✅ Setup complete.',
          '',
          '  Next: ak blueprint new "your first task"',
          '        ak gain          # token savings after your first session',
        ].join('\n'),
      )
    }

    return EXIT_SUCCESS
  } catch (error) {
    if (error instanceof Error && /catalogDir does not exist/.test(error.message)) {
      console.error(
        'ak init: @webpresso/agent-kit not installed in node_modules. ' +
          'Run `pnpm install` first.',
      )
      return EXIT_SETUP_FAIL
    }
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

  // Help text is data-driven so adding a preset (PRESETS) automatically
  // updates --help. Prevents the docs/code drift we discovered when
  // omx + gstack landed without surfacing in --help.
  const withHelp =
    `Comma-separated Tier-3 skills and/or presets to install ` +
    `(non-interactive). Presets: ${PRESETS.join(', ')}. ` +
    `Tier-3 skills are listed by 'ak skill list'.`

  cli
    .command(commandName, description)
    .option('--with <skills>', withHelp)
    .option('--host <hosts>', 'Comma-separated host targets: codex, claude, opencode, all')
    .option('--all', 'Install every skill (Tier-1 + Tier-2 + all Tier-3)')
    .option(
      '--overwrite',
      'Replace consumer customizations (default: write new files to <name>.new)',
    )
    .option('--dry-run', 'Show what would change without writing anything')
    .option('--yes', 'Accept defaults, skip interactive prompts')
    .option('--cwd <dir>', 'Working tree to scaffold into (default: process.cwd())')
    .option('--strict', 'Abort if any compatibility check fails (default: warn and continue)')
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
