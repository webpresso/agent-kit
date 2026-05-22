/**
 * `wp setup` / `wp init` — scaffolds the agent-kit catalog into a consumer repo.
 *
 * Idempotent: re-runs reconcile against `.agent-kitrc.json`.
 * Safe-by-default: if a target file exists with different content, reports
 * drift and leaves it untouched unless `--overwrite` is passed.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTelemetryEnabled, reportTthw } from '#telemetry/setup-tthw';
import { readPackageVersion } from '#cli/utils';
import { resolveBlueprintRoot } from '#utils/blueprint-root';
import { runUnifiedSync } from '#symlinker/unified-sync';
import { defaultConfig, mergeConfig, readConfig, writeConfig, } from './config.js';
import { detectConsumer, warnIfNonLocalCli } from './detect-consumer.js';
import { runPreflight, DOCS_URL } from './preflight.js';
import { summarizeResults } from './merge.js';
import { resolveTier3Selection } from './prompts.js';
import { scaffoldAgent, RENDERED_SKILLS, TIER1_SKILLS, TIER2_SKILLS } from './scaffold-agent.js';
import { scaffoldAgentRules } from './scaffold-agent-rules.js';
import { scaffoldAgentSkills } from './scaffold-agent-skills.js';
import { scaffoldCatalogIgnore } from './scaffold-catalog-ignore.js';
import { GENERATED_PATHS_BLOCK, patchGitignore } from './gitignore-patcher.js';
import { scaffoldAgentsMd } from './scaffold-agents-md.js';
import { scaffoldBlueprints } from './scaffold-blueprints.js';
import { scaffoldDocs } from './scaffold-docs.js';
import { scaffoldBaseKit } from './scaffold-base-kit.js';
import { scaffoldMonorepoNav } from './scaffold-monorepo-nav.js';
import { REQUIRED_CORE_CAPABILITIES, auditHostSkillVisibility, parseAgentHosts, serializeHostVisibility, summarizeHostVisibility, } from './host-visibility.js';
import { scaffoldAgentHooks, trustCodexAgentKitHooksForRepo, trustCodexPresetHooksForUser, } from './scaffolders/agent-hooks/index.js';
import { scaffoldAuditHooks } from './scaffolders/audit-hooks/index.js';
import { ensureClaudeCodeUserPlugin } from './scaffolders/claude-plugin/index.js';
import { scaffoldClaudeRules } from './scaffolders/claude-rules/index.js';
import { ensureCodexAgentKitMcp, ensureCodexPlaywrightMcp } from './scaffolders/codex-mcp/index.js';
import { scaffoldExampleSkill } from './scaffolders/example-skill/index.js';
import { ensureGstack } from './scaffolders/gstack/index.js';
import { scaffoldLoreCommits } from './scaffolders/lore-commits/index.js';
import { ensureOmx } from './scaffolders/omx/index.js';
import { ensureOmc, OMC_SETUP_COMMAND } from './scaffolders/omc/index.js';
import { ensureContextMode } from './scaffolders/context-mode/index.js';
import { scaffoldOpencodePlugin } from './scaffolders/opencode-plugin/index.js';
import { ensureRtk } from './scaffolders/rtk/index.js';
import { checkRuntimes } from './scaffolders/runtime-check/index.js';
import { scaffoldSubagents } from './scaffolders/subagents/index.js';
import { maybeRunVisionInterview } from './scaffolders/vision/interview.js';
import { scaffoldVision } from './scaffolders/vision/index.js';
import { scaffoldWorkspaceConfig } from './scaffolders/workspace-config/index.js';
const PRESETS = [
    'context-mode',
    'example-skill',
    'gstack',
    'lore-commits',
    'omc',
    'omx',
    'playwright-mcp',
    'rtk',
    'vision',
];
const DEFAULT_PRESETS = ['omx', 'omc', 'gstack', 'vision', 'rtk'];
const RTK_REQUESTED_MARKER = join('.agent', '.rtk-requested');
function parsePresets(withFlag) {
    const explicit = withFlag
        ? withFlag
            .split(',')
            .map((s) => s.trim())
            .filter((s) => PRESETS.includes(s))
        : [];
    return [...new Set([...DEFAULT_PRESETS, ...explicit])];
}
export const EXIT_SUCCESS = 0;
export const EXIT_SETUP_FAIL = 1;
export const EXIT_USER_ABORT = 2;
export const EXIT_WRITE_FAIL = 3;
export function resolveCatalogDir() {
    // The `catalog/` directory is bundled alongside `package.json` in the
    // published tarball (see `files` in package.json). To locate it at both
    // development time (src/cli/commands/init/index.ts) and at runtime (dist/cli.js),
    // we walk up from this module looking for the nearest package.json.
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let depth = 0; depth < 8; depth++) {
        if (existsSync(join(dir, 'package.json'))) {
            const candidate = join(dir, 'catalog');
            if (existsSync(candidate))
                return candidate;
        }
        const parent = dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    throw new Error('wp init: could not locate the agent-kit catalog directory. The package may be broken.');
}
function inferBlueprintsDirOverride(repoRoot, existingConfig) {
    if (existingConfig?.blueprintsDir)
        return existingConfig.blueprintsDir;
    const resolved = resolveBlueprintRoot(repoRoot);
    const relativePath = relative(repoRoot, resolved).replaceAll('\\', '/');
    if (relativePath.length === 0 || relativePath === '.' || relativePath === 'blueprints') {
        return undefined;
    }
    return relativePath;
}
export async function runInit(flags) {
    const startMs = Date.now();
    const cwd = flags.cwd ?? process.cwd();
    const consumer = detectConsumer(cwd);
    if (!consumer) {
        console.error(`wp init: could not find a git repo (walked up from ${cwd}).\n` +
            `Run \`git init\` first, or pass --cwd pointing at a git working tree.`);
        return EXIT_SETUP_FAIL;
    }
    warnIfNonLocalCli(consumer.repoRoot);
    // Run the 5-point compatibility preflight before any scaffolders fire.
    const preflightResult = await runPreflight(consumer.repoRoot, flags.strict ?? false);
    if (preflightResult.warnings.length > 0) {
        if (!preflightResult.ok) {
            // strict mode: abort
            for (const warning of preflightResult.warnings) {
                console.error(`  preflight: ✗ ${warning}`);
            }
            console.error(`\nwp setup: aborting — ${preflightResult.warnings.length} compatibility check(s) failed.\n` +
                `See ${DOCS_URL}`);
            return EXIT_SETUP_FAIL;
        }
        // non-strict: warn and continue
        for (const warning of preflightResult.warnings) {
            console.warn(`  preflight: ⚠ ${warning}`);
        }
        console.warn(`  See ${DOCS_URL}`);
    }
    else {
        console.log(`  preflight: ✓ all 5 compatibility checks passed`);
    }
    const catalogDir = resolveCatalogDir();
    const packageRoot = dirname(catalogDir);
    const options = {
        overwrite: flags.overwrite ?? false,
        dryRun: flags['dry-run'] ?? false,
    };
    const existingConfig = readConfig(consumer.repoRoot);
    const presets = parsePresets(flags.with);
    let selectedHosts;
    try {
        selectedHosts = parseAgentHosts(flags.host);
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return EXIT_SETUP_FAIL;
    }
    // Extract tier3 skills portion of --with (non-preset values)
    const withFlagWithoutPresets = flags.with
        ?.split(',')
        .map((s) => s.trim())
        .filter((s) => !PRESETS.includes(s))
        .join(',') || undefined;
    let tier3Selection;
    try {
        const selection = await resolveTier3Selection({
            withFlag: withFlagWithoutPresets,
            allFlag: flags.all,
            yesFlag: flags.yes,
            existing: existingConfig?.installed.tier3Skills,
            isTTY: Boolean(process.stdin.isTTY),
        });
        if (selection.aborted) {
            console.error('wp init: aborted by user.');
            return EXIT_USER_ABORT;
        }
        tier3Selection = selection.selected;
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return EXIT_SETUP_FAIL;
    }
    console.log(`wp init: scaffolding into ${consumer.repoRoot}`);
    if (options.dryRun)
        console.log('  mode: DRY RUN (no writes)');
    if (options.overwrite)
        console.log('  mode: --overwrite (consumer customizations will be replaced)');
    console.log(`  Tier-3 skills: ${tier3Selection.length > 0 ? tier3Selection.join(', ') : '(none)'}`);
    // Unconditional: workspace config is always needed for cross-repo correlation.
    if (!options.dryRun) {
        const workspaceConfigResult = await scaffoldWorkspaceConfig();
        if (workspaceConfigResult.action === 'created') {
            console.log('  workspace config: ✓ created ~/.agent/workspace.yaml');
        }
    }
    try {
        const agentReport = scaffoldAgent({
            catalogDir,
            repoRoot: consumer.repoRoot,
            options,
        });
        // Wave-3: rules + skills are no longer copied. They flow through
        // consumer-owned `agent-rules/` / `agent-skills/` directories projected
        // into per-IDE surfaces by `runUnifiedSync` below. The scaffolders below
        // create those canonical directories with .gitkeep + README + .gitignore
        // patches so the source-of-truth surface exists before sync runs.
        const agentRulesReport = scaffoldAgentRules({
            cwd: consumer.repoRoot,
            dryRun: options.dryRun,
            overwrite: options.overwrite,
        });
        const agentSkillsReport = scaffoldAgentSkills({
            cwd: consumer.repoRoot,
            dryRun: options.dryRun,
            overwrite: options.overwrite,
        });
        const catalogIgnoreReport = scaffoldCatalogIgnore({
            cwd: consumer.repoRoot,
            catalogDir,
            dryRun: options.dryRun,
            overwrite: options.overwrite,
        });
        const generatedSurfaceIgnoreResult = patchGitignore(join(consumer.repoRoot, '.gitignore'), GENERATED_PATHS_BLOCK, { dryRun: options.dryRun, overwrite: true });
        const baseKitResults = tier3Selection.includes('base-kit')
            ? scaffoldBaseKit({ catalogDir, repoRoot: consumer.repoRoot, options })
            : [];
        const docsResults = scaffoldDocs({ catalogDir, repoRoot: consumer.repoRoot, options });
        const blueprintResults = scaffoldBlueprints({ repoRoot: consumer.repoRoot, options });
        const monorepoResults = scaffoldMonorepoNav({
            catalogDir,
            repoRoot: consumer.repoRoot,
            consumer,
            options,
        });
        // Unified sync runs before downstream scaffolders that read from
        // `.agent/skills/` (agent-hooks needs SKILL.md frontmatter to extract
        // hook entries). Rendered repo-local skills are written into the
        // consumer-owned `agent-skills/` tree first, then projected like every
        // other skill.
        const allowedSkillSlugs = new Set([
            ...TIER1_SKILLS,
            ...TIER2_SKILLS,
            ...RENDERED_SKILLS,
            ...tier3Selection,
        ]);
        if (!options.dryRun) {
            runUnifiedSync({
                catalogDir: join(catalogDir, 'agent'),
                consumerRoot: consumer.repoRoot,
                kinds: ['rule', 'skill'],
                check: false,
                allowedSkillSlugs,
            });
        }
        const blueprintsDir = inferBlueprintsDirOverride(consumer.repoRoot, existingConfig);
        const config = mergeConfig(existingConfig, {
            ...defaultConfig(),
            installed: { tier3Skills: [...tier3Selection].toSorted() },
            hosts: {
                selected: selectedHosts,
                requiredCapabilities: [...REQUIRED_CORE_CAPABILITIES],
            },
            ...(blueprintsDir ? { blueprintsDir } : {}),
        });
        let agentHooksResult = await scaffoldAgentHooks({ repoRoot: consumer.repoRoot, options });
        const auditHooksResult = scaffoldAuditHooks({ repoRoot: consumer.repoRoot, options });
        const opencodePluginResult = scaffoldOpencodePlugin({ repoRoot: consumer.repoRoot, options });
        let claudeRulesResults = [];
        try {
            claudeRulesResults = scaffoldClaudeRules({ repoRoot: consumer.repoRoot, options });
        }
        catch (error) {
            if (error instanceof Error &&
                error.message.includes('@webpresso/agent-kit not found in node_modules')) {
                console.error(`wp init: setup failed — ${error.message}`);
                return EXIT_SETUP_FAIL;
            }
            throw error;
        }
        const subagentResults = scaffoldSubagents({ repoRoot: consumer.repoRoot, options });
        const agentsMdResult = scaffoldAgentsMd({
            catalogDir,
            repoRoot: consumer.repoRoot,
            consumer,
            config,
            options,
        });
        if (!options.dryRun) {
            writeConfig(consumer.repoRoot, config);
        }
        // Apply scaffolder presets
        const presetResults = [];
        if (presets.includes('lore-commits')) {
            presetResults.push(scaffoldLoreCommits({ repoRoot: consumer.repoRoot, options }));
        }
        if (presets.includes('example-skill') && !options.dryRun) {
            await scaffoldExampleSkill(consumer.repoRoot);
            console.log('  example-skill: ✓ scaffolded .agent/skills/hello-webpresso/SKILL.md');
        }
        if (presets.includes('vision')) {
            // Only interview the operator when VISION.md is being scaffolded fresh
            // (preserves --yes, non-TTY, and existing-VISION non-clobber semantics).
            const visionPath = join(consumer.repoRoot, 'VISION.md');
            const visionAnswers = await maybeRunVisionInterview({
                repoName: basename(consumer.repoRoot),
                isTTY: Boolean(process.stdin.isTTY),
                yesFlag: flags.yes,
                visionExists: existsSync(visionPath),
            });
            const visionResult = scaffoldVision({
                catalogDir,
                repoRoot: consumer.repoRoot,
                options,
                answers: visionAnswers,
            });
            if (visionResult.action === 'created') {
                if (visionAnswers) {
                    console.log('  vision: ✓ scaffolded VISION.md from your answers');
                }
                else {
                    console.log(`  vision: ✓ scaffolded ${visionPath} (template stub — fill it in, then \`wp audit vision\`)`);
                }
            }
            presetResults.push(visionResult);
        }
        if (presets.includes('context-mode')) {
            const contextModeResult = ensureContextMode({
                repoRoot: consumer.repoRoot,
                options,
                globalInstall: config.globalInstall,
            });
            console.log(`  context-mode codex mcp: ${contextModeResult.codexMcp.action === 'identical' ? 'already configured' : contextModeResult.codexMcp.action === 'skipped-dry' ? 'skipped (--dry-run)' : '✓'} ${contextModeResult.codexMcp.targetPath}`);
            console.log(`  context-mode codex hooks: ${contextModeResult.codexHooks.action === 'identical' ? 'already configured' : contextModeResult.codexHooks.action === 'skipped-dry' ? 'skipped (--dry-run)' : '✓'} ${contextModeResult.codexHooks.targetPath}`);
            console.log(`  context-mode opencode config: ${contextModeResult.opencodeConfig.action === 'identical' ? 'already configured' : contextModeResult.opencodeConfig.action === 'skipped-dry' ? 'skipped (--dry-run)' : '✓'} ${contextModeResult.opencodeConfig.targetPath}`);
        }
        // CI runners (GitHub Actions, etc.) set CI=true but don't have optional
        // developer-workstation tools (omx, gstack, rtk) available. Failures from
        // these installations must not fail the postinstall in that context.
        const isCiEnvironment = process.env.CI === 'true' || process.env.CI === '1';
        let omxFailure = null;
        if (isCiEnvironment && presets.includes('omx')) {
            console.log('  omx setup: - skipped (CI environment)');
        }
        else if (presets.includes('omx')) {
            const omxResult = ensureOmx({
                repoRoot: consumer.repoRoot,
                options,
                scope: flags.project ? 'project' : 'user',
            });
            switch (omxResult.kind) {
                case 'omx-ok':
                    console.log(omxResult.installed ? '  omx setup: ✓ installed + configured' : '  omx setup: ✓');
                    if (omxResult.removedProjectFiles.length > 0) {
                        console.log(`  omx project-scope cleanup: ✓ removed ${omxResult.removedProjectFiles.length} tracked file(s)`);
                    }
                    break;
                case 'omx-skipped-dry-run':
                    console.log('  omx setup: skipped (--dry-run)');
                    break;
                case 'omx-not-found':
                    console.error(`  omx setup: ✗ ${omxResult.hint}`);
                    omxFailure = 'not-found';
                    break;
                case 'omx-spawn-failed':
                    console.error(`  omx setup: ✗ exited with ${omxResult.exitCode}`);
                    omxFailure = 'spawn-failed';
                    break;
            }
        }
        if (presets.includes('playwright-mcp') || presets.includes('omx')) {
            const playwrightMcpResult = ensureCodexPlaywrightMcp({ options });
            switch (playwrightMcpResult.kind) {
                case 'codex-playwright-mcp-written':
                    console.log(`  codex playwright mcp: ✓ ${playwrightMcpResult.path}`);
                    break;
                case 'codex-playwright-mcp-unchanged':
                    console.log(`  codex playwright mcp: already configured at ${playwrightMcpResult.path}`);
                    break;
                case 'codex-playwright-mcp-skipped-dry-run':
                    console.log('  codex playwright mcp: skipped (--dry-run)');
                    break;
            }
        }
        if (presets.includes('omx')) {
            agentHooksResult = await scaffoldAgentHooks({ repoRoot: consumer.repoRoot, options });
        }
        if (isCiEnvironment && presets.includes('omc')) {
            console.log('  omc plugin: - skipped (CI environment)');
        }
        else if (presets.includes('omc')) {
            const omcResult = ensureOmc({
                options,
                scope: flags.project ? 'project' : 'user',
            });
            switch (omcResult.kind) {
                case 'omc-installed':
                    console.log(`  omc plugin: ✓ ${omcResult.scope}-scope plugin ensured (${omcResult.pluginId}); next in Claude Code: ${OMC_SETUP_COMMAND} --${omcResult.scope === 'project' ? 'local' : 'global'}`);
                    break;
                case 'omc-skipped-dry-run':
                    console.log('  omc plugin: skipped (--dry-run)');
                    break;
                case 'omc-skipped-opt-out':
                    console.log('  omc plugin: skipped (AK_SKIP_OMC=1)');
                    break;
                case 'omc-skipped-no-cli':
                    console.warn('  omc plugin: - skipped (claude not on PATH; OMC installs through Claude Code plugin marketplace only)');
                    break;
                case 'omc-failed':
                    console.warn(`  omc plugin: ⚠ ${omcResult.step} exited with ${omcResult.exitCode}; ` +
                        `fallback: claude plugin marketplace add --scope ${omcResult.scope} https://github.com/Yeachan-Heo/oh-my-claudecode && ` +
                        `claude plugin install --scope ${omcResult.scope} ${omcResult.pluginId}`);
                    break;
            }
        }
        // OMX setup can repair legacy duplicate hook trust-state blocks by
        // clearing all `[hooks.state]` entries before rehydrating its own hooks.
        // Re-apply agent-kit's trust hashes after that possible cleanup.
        await trustCodexAgentKitHooksForRepo({ repoRoot: consumer.repoRoot, options });
        await trustCodexPresetHooksForUser({ repoRoot: consumer.repoRoot, options });
        // Always upsert agent-kit's MCP entry into the user's codex config when
        // an install root is discoverable. Codex's config.toml is user-global, so
        // we resolve to whatever absolute install path exists today (Claude
        // plugin / bun global / pnpm global / npm global) and write that.
        const agentKitMcpResult = ensureCodexAgentKitMcp({ options });
        switch (agentKitMcpResult.kind) {
            case 'codex-agent-kit-mcp-written':
                console.log(`  codex agent-kit mcp: ✓ ${agentKitMcpResult.path} → ${agentKitMcpResult.entryPath}`);
                break;
            case 'codex-agent-kit-mcp-unchanged':
                console.log(`  codex agent-kit mcp: already configured at ${agentKitMcpResult.path}`);
                break;
            case 'codex-agent-kit-mcp-skipped-dry-run':
                console.log('  codex agent-kit mcp: skipped (--dry-run)');
                break;
            case 'codex-agent-kit-mcp-not-installed':
                console.log(`  codex agent-kit mcp: ⚠ no install root found (checked ${agentKitMcpResult.checked.length} paths). Install agent-kit globally (\`bun add -g @webpresso/agent-kit\`) or via the Claude plugin to wire up codex MCP.`);
                break;
        }
        const claudePluginResult = ensureClaudeCodeUserPlugin({
            options,
            packageRoot,
        });
        switch (claudePluginResult.kind) {
            case 'claude-plugin-installed':
                console.log(`  claude plugin: ✓ user-scope marketplace + plugin ensured (${claudePluginResult.pluginId})`);
                break;
            case 'claude-plugin-skipped-dry-run':
                console.log('  claude plugin: skipped (--dry-run)');
                break;
            case 'claude-plugin-skipped-opt-out':
                console.log('  claude plugin: skipped (AK_SKIP_CLAUDE_PLUGIN=1)');
                break;
            case 'claude-plugin-skipped-no-cli':
                console.log('  claude plugin: - skipped (claude not on PATH)');
                break;
            case 'claude-plugin-unavailable':
                console.log('  claude plugin: - skipped (plugin manifest unavailable in this install)');
                break;
            case 'claude-plugin-failed':
                console.warn(`  claude plugin: ⚠ ${claudePluginResult.step} exited with ${claudePluginResult.exitCode}; ` +
                    `fallback: claude plugin marketplace add --scope user ${claudePluginResult.packageRoot} && ` +
                    `claude plugin install --scope user ${claudePluginResult.pluginId}`);
                break;
        }
        let gstackFailure = null;
        if (process.env.AK_SKIP_GSTACK === '1') {
            console.warn('  gstack: ⚠ AK_SKIP_GSTACK=1 — skipping. Most consumer repos treat gstack as a hard prerequisite.');
        }
        else if (isCiEnvironment && presets.includes('gstack')) {
            console.log('  gstack: - skipped (CI environment)');
        }
        else if (presets.includes('gstack')) {
            const gstackResult = ensureGstack({ repoRoot: consumer.repoRoot, options });
            switch (gstackResult.kind) {
                case 'gstack-installed':
                    console.log(`  gstack: ✓ installed at ${gstackResult.root}`);
                    switch (gstackResult.codex.kind) {
                        case 'gstack-codex-installed':
                            console.log(`  gstack (codex): ✓ installed at ${gstackResult.codex.skillsRoot}`);
                            break;
                        case 'gstack-codex-updated':
                            console.log(`  gstack (codex): ✓ updated at ${gstackResult.codex.skillsRoot}`);
                            break;
                        case 'gstack-codex-skipped':
                            console.log(`  gstack (codex): - skipped (${gstackResult.codex.reason})`);
                            break;
                    }
                    break;
                case 'gstack-updated':
                    console.log(`  gstack: ✓ updated at ${gstackResult.root}`);
                    switch (gstackResult.codex.kind) {
                        case 'gstack-codex-installed':
                            console.log(`  gstack (codex): ✓ installed at ${gstackResult.codex.skillsRoot}`);
                            break;
                        case 'gstack-codex-updated':
                            console.log(`  gstack (codex): ✓ updated at ${gstackResult.codex.skillsRoot}`);
                            break;
                        case 'gstack-codex-skipped':
                            console.log(`  gstack (codex): - skipped (${gstackResult.codex.reason})`);
                            break;
                    }
                    break;
                case 'gstack-skipped-dry-run':
                    console.log('  gstack: skipped (--dry-run)');
                    break;
                case 'gstack-clone-failed':
                    console.error(`  gstack: ✗ git clone exited with ${gstackResult.exitCode}`);
                    gstackFailure = 'clone-failed';
                    break;
                case 'gstack-pull-failed':
                    console.error(`  gstack: ✗ git pull exited with ${gstackResult.exitCode}`);
                    gstackFailure = 'pull-failed';
                    break;
                case 'gstack-setup-failed':
                    console.error(`  gstack: ✗ ./setup ${gstackResult.command} exited with ${gstackResult.exitCode}`);
                    gstackFailure = 'setup-failed';
                    break;
            }
        }
        let rtkFailure = null;
        if (process.env.AK_SKIP_RTK === '1') {
            console.warn('  rtk: ⚠ AK_SKIP_RTK=1 — skipping. RTK provides shell-tool output filtering for git/gh/kubectl/etc.');
        }
        else if (isCiEnvironment && presets.includes('rtk')) {
            console.log('  rtk: - skipped (CI environment)');
        }
        else if (presets.includes('rtk')) {
            if (!options.dryRun) {
                mkdirSync(join(consumer.repoRoot, '.agent'), { recursive: true });
                writeFileSync(join(consumer.repoRoot, RTK_REQUESTED_MARKER), 'managed by wp setup (default-on)\n');
            }
            const rtkResult = ensureRtk({ repoRoot: consumer.repoRoot, options });
            switch (rtkResult.kind) {
                case 'rtk-ok':
                    console.log(rtkResult.installed ? '  rtk: ✓ installed + configured' : '  rtk: ✓');
                    break;
                case 'rtk-skipped-dry-run':
                    console.log('  rtk: skipped (--dry-run)');
                    break;
                case 'rtk-not-found':
                    console.error(`  rtk: ✗ ${rtkResult.hint}`);
                    rtkFailure = 'not-found';
                    break;
                case 'rtk-init-failed':
                    console.error(`  rtk: ✗ rtk init exited with ${rtkResult.exitCode}`);
                    rtkFailure = 'init-failed';
                    break;
            }
        }
        const all = [
            ...agentReport.results,
            ...agentRulesReport.results,
            ...agentSkillsReport.results,
            ...catalogIgnoreReport.results,
            generatedSurfaceIgnoreResult,
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
            },
            opencodePluginResult,
            ...claudeRulesResults,
            ...subagentResults,
            ...presetResults,
        ];
        const summary = summarizeResults(all);
        console.log('\nScaffold summary:');
        console.log(`  created:         ${summary.created}`);
        console.log(`  identical:       ${summary.identical}`);
        console.log(`  overwritten:     ${summary.overwritten}`);
        console.log(`  drifted:         ${summary.drifted}`);
        if (options.dryRun)
            console.log(`  would-change:    ${summary['skipped-dry']}`);
        if (summary.drifted > 0) {
            console.log('\n  Note: some files exist with different content and were left unchanged.\n' +
                '  Review the drift or re-run with `--overwrite` to replace them.');
        }
        if (!options.dryRun) {
            const visibilityAudit = auditHostSkillVisibility({
                repoRoot: consumer.repoRoot,
                hosts: selectedHosts,
                requiredCapabilities: [...REQUIRED_CORE_CAPABILITIES],
            });
            config.hosts = {
                selected: selectedHosts,
                requiredCapabilities: [...REQUIRED_CORE_CAPABILITIES],
                visibility: serializeHostVisibility(visibilityAudit),
            };
            writeConfig(consumer.repoRoot, config);
            console.log('\nHost skill visibility:');
            for (const line of summarizeHostVisibility(consumer.repoRoot, visibilityAudit)) {
                console.log(line);
            }
            const missing = visibilityAudit.results.filter((result) => result.status === 'not-visible');
            if (missing.length > 0) {
                if (isCiEnvironment) {
                    // CI runners don't have skills installed (no claude, no ~/.claude/skills/).
                    // Skill visibility is a developer-workstation concern; skip the hard gate.
                    console.log(`  host visibility: - skipped hard gate (CI environment, ${missing.length} capability/host pair(s) not visible)`);
                }
                else {
                    console.error(`\nwp setup: host visibility check failed for ${missing
                        .map((result) => `${result.host}/${result.capability}`)
                        .join(', ')}`);
                    return EXIT_SETUP_FAIL;
                }
            }
        }
        if (!options.dryRun) {
            const runtimes = checkRuntimes();
            if (runtimes.length > 0) {
                console.log('\nRuntime check:');
                for (const r of runtimes) {
                    if (r.version)
                        console.log(`  ${r.name}: ✓ ${r.version}`);
                    else
                        console.log(`  ${r.name}: ✗ not on PATH — ${r.hint}`);
                }
            }
        }
        console.log('\nwp init: done.');
        if (omxFailure === 'not-found')
            return EXIT_SETUP_FAIL;
        if (omxFailure === 'spawn-failed')
            return EXIT_WRITE_FAIL;
        if (gstackFailure === 'clone-failed')
            return EXIT_WRITE_FAIL;
        if (gstackFailure === 'pull-failed')
            return EXIT_WRITE_FAIL;
        if (gstackFailure === 'setup-failed')
            return EXIT_WRITE_FAIL;
        if (rtkFailure === 'not-found')
            return EXIT_SETUP_FAIL;
        if (rtkFailure === 'init-failed')
            return EXIT_WRITE_FAIL;
        if (isTelemetryEnabled(process.env)) {
            const payload = {
                event: 'setup-complete',
                durationMs: Date.now() - startMs,
                agentKitVersion: readPackageVersion(import.meta.url),
                os: process.platform,
                nodeVersion: process.version,
            };
            await Promise.race([reportTthw(payload), new Promise((r) => setTimeout(r, 100))]);
        }
        // Lane-4 framing — printed once on every successful completion so users
        // know which tool owns which part of the dev-workflow surface.
        console.log([
            '',
            'Ownership lanes:',
            '  Lane 1 wp_*   blueprint · audit · quality',
            '  Lane 2 ctx_*  context-mode (context reduction)',
            '  Lane 3 rtk    shell-tool token filtering',
            '  Lane 4 gstack interactive workflows',
        ].join('\n'));
        // Next-steps block — only when not in dry-run (real writes happened).
        if (!options.dryRun) {
            console.log([
                '',
                '✅ Setup complete.',
                '',
                '  Next: wp blueprint new "your first task"',
                '        wp gain          # token savings after your first session',
            ].join('\n'));
        }
        return EXIT_SUCCESS;
    }
    catch (error) {
        if (error instanceof Error && /catalogDir does not exist/.test(error.message)) {
            console.error('wp init: @webpresso/agent-kit not installed in node_modules. ' + 'Run `vp install` first.');
            return EXIT_SETUP_FAIL;
        }
        console.error(`wp init: write failed — ${error instanceof Error ? error.message : String(error)}`);
        return EXIT_WRITE_FAIL;
    }
}
export function registerInitCommand(cli, commandName = 'init') {
    const description = commandName === 'setup'
        ? 'Scaffold agent-kit catalog into the current repo'
        : 'Compatibility alias for wp setup';
    // Help text is data-driven so adding a preset (PRESETS) automatically
    // updates --help. Prevents the docs/code drift we discovered when
    // omx + gstack landed without surfacing in --help.
    const withHelp = `Comma-separated Tier-3 skills and/or presets to install ` +
        `(non-interactive). Presets: ${PRESETS.join(', ')}. ` +
        `Tier-3 skills are listed by 'wp skill list'.`;
    cli
        .command(commandName, description)
        .option('--with <skills>', withHelp)
        .option('--host <hosts>', 'Comma-separated host targets: codex, claude, opencode, all')
        .option('--all', 'Install every skill (Tier-1 + Tier-2 + all Tier-3)')
        .option('--overwrite', 'Replace consumer customizations (default: leave divergent files untouched)')
        .option('--dry-run', 'Show what would change without writing anything')
        .option('--yes', 'Accept defaults, skip interactive prompts')
        .option('--cwd <dir>', 'Working tree to scaffold into (default: process.cwd())')
        .option('--strict', 'Abort if any compatibility check fails (default: warn and continue)')
        .option('--project', 'Configure OMX/OMC in project scope instead of the default user scope')
        .action(async (flags) => {
        const code = await runInit(flags);
        if (code !== EXIT_SUCCESS) {
            const err = new Error('exit');
            err.exitCode = code;
            throw err;
        }
        return code;
    });
}
//# sourceMappingURL=index.js.map