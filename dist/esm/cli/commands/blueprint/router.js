import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseBlueprintForDb } from '#db/parser/blueprint-db-parser';
import { blueprintToSpecKit } from '#export/spec-kit/index';
import { getProjectRoot } from '#cli/utils';
import { resolveBlueprintRoot } from '#utils/blueprint-root';
import { applyBlueprintLifecycleToFile, BlueprintCreationService, BlueprintService, complexitySchema, relativeBlueprintSlug, parseBlueprint, planStatusSchema, runBlueprintAudit, resolveBlueprintFile, serializeBlueprint, validateAllTasksDone, } from '#local';
import { resolvePackageAssetPreferred } from '#utils/package-assets';
import { describeBlueprintExecutionRuntime, buildBlueprintLaunchSpec, buildStoppedRuntimeEvidence, controlBlueprintExecution, initializeBlueprintExecutionProgressBridge, launchBlueprintExecution, persistBlueprintExecutionArtifacts, persistBlueprintExecutionMetadata, recordLaunchFailure, reconcileBlueprintRuntimeSnapshot, readBlueprintExecutionState, syncBlueprintExecutionProgress, writeBlueprintRuntimeSnapshot, } from './execution.js';
import { advanceTask as advanceTaskMutation, finalizeBlueprint as finalizeBlueprintMutation, promoteBlueprint as promoteBlueprintMutation, } from './mutations.js';
import { BlueprintAuditFailedError, executeBlueprintSubcommand } from './router-dispatch.js';
import { formatBlueprintAudit, formatBlueprintCreation, formatBlueprintDetails, formatBlueprintExecution, formatBlueprintSummaries, getBlueprintHelpText, handleBlueprintError, printBlueprintOutput, } from './router-output.js';
export { formatBlueprintSummaries } from './router-output.js';
function assertBlueprintCanMoveToStatus(blueprint, nextStatus) {
    if (nextStatus !== 'completed') {
        return;
    }
    const validation = validateAllTasksDone(blueprint);
    if (!validation.valid) {
        throw new Error([
            `Blueprint ${blueprint.name} cannot move to completed.`,
            validation.message ?? 'Incomplete tasks remain.',
        ].join('\n'));
    }
}
/**
 * Resolve the blueprint-template path.
 *
 * Two strategies, tried in order:
 *   1. If a repo-root marker (`pnpm-workspace.yaml`) is found upward from
 *      `import.meta.dirname`, use `<repoRoot>/docs/templates/blueprint.md`.
 *      This keeps the wp-style lookup working when webpresso is consumed
 *      inside the webpresso monorepo.
 *   2. Otherwise, fall back to the template bundled inside this package at
 *      `catalog/docs/templates/blueprint.md`. Allows consumers to run the
 *      CLI outside a pnpm workspace without supplying `--template-path`.
 *
 * Resolution is lazy — returns a function so we don't throw at module load
 * when the lookup fails in unrelated contexts (e.g. `wp --help`).
 */
function resolveRepoBlueprintTemplatePath() {
    return resolvePackageAssetPreferred([
        'docs/templates/blueprint.md',
        'catalog/docs/templates/blueprint.md',
    ]);
}
function todayIsoDate() {
    return new Date().toISOString().split('T')[0] ?? new Date().toISOString();
}
function nowIsoTimestamp() {
    return new Date().toISOString();
}
function resolveProjectRoot(projectRoot) {
    return projectRoot ?? getProjectRoot();
}
function normalizeBlueprintComplexity(complexity) {
    if (!complexity) {
        throw new Error('Usage: wp blueprint new "<goal>" --complexity <XS|S|M|L|XL>');
    }
    const parsed = complexitySchema.safeParse(complexity);
    if (!parsed.success) {
        throw new Error(`Invalid blueprint complexity: ${complexity}. Valid values: ${complexitySchema.options.join(', ')}`);
    }
    return parsed.data;
}
function normalizeBlueprintStatus(status) {
    const parsed = planStatusSchema.safeParse(status);
    if (!parsed.success) {
        throw new Error(`Invalid blueprint status: ${status}. Valid statuses: ${planStatusSchema.options.join(', ')}`);
    }
    return parsed.data;
}
function readStagedFiles(projectRoot) {
    const stdout = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
        cwd: projectRoot,
        encoding: 'utf-8',
    });
    return stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}
async function resolveBlueprintLocation(slug, projectRoot) {
    const match = await resolveBlueprintFile(projectRoot, slug);
    const raw = await readFile(match.path, 'utf-8');
    return {
        blueprint: parseBlueprint(raw, match.slug),
        path: match.path,
        slug: match.slug,
    };
}
async function writeBlueprintWithStatus(blueprintPath, blueprint, status) {
    if (blueprint.status === status) {
        return false;
    }
    const updatedBlueprint = {
        ...blueprint,
        lastUpdated: todayIsoDate(),
        status,
    };
    const serialized = serializeBlueprint(updatedBlueprint);
    await writeFile(blueprintPath, serialized, 'utf-8');
    return true;
}
async function applyLifecycleMutation(slug, intent, projectRoot) {
    const mutation = await applyBlueprintLifecycleToFile(projectRoot, slug, intent);
    return {
        message: `Updated blueprint ${mutation.slug} to ${mutation.targetStatus}.`,
        moved: mutation.moved,
        progress: mutation.progress,
        slug: mutation.slug,
        status: mutation.targetStatus,
        ...('taskId' in intent ? { taskId: intent.taskId } : {}),
    };
}
export async function listBlueprints(options = {}) {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const service = new BlueprintService(projectRoot);
    const summaries = await service.list();
    const filteredByType = options.onlyRoadmaps
        ? summaries.filter((summary) => summary.type === 'parent-roadmap')
        : summaries;
    if (!options.status) {
        return filteredByType.toSorted(compareBlueprintSummaries);
    }
    const status = normalizeBlueprintStatus(options.status);
    return filteredByType
        .filter((summary) => summary.status === status)
        .toSorted(compareBlueprintSummaries);
}
function compareBlueprintSummaries(left, right) {
    const leftRank = left.type === 'parent-roadmap' ? 0 : 1;
    const rightRank = right.type === 'parent-roadmap' ? 0 : 1;
    return leftRank - rightRank || left.name.localeCompare(right.name);
}
export async function showBlueprint(slug, options = {}) {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const location = await resolveBlueprintLocation(slug, projectRoot);
    return {
        blueprint: location.blueprint,
        location: {
            path: location.path,
            projectRoot,
        },
        slug: location.slug,
    };
}
export async function createBlueprint(goal, options = {}) {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const complexity = normalizeBlueprintComplexity(options.complexity);
    const type = normalizeBlueprintType(options.type);
    const service = new BlueprintCreationService(projectRoot, {
        templatePath: options.templatePath ?? resolveRepoBlueprintTemplatePath(),
    });
    const created = await service.create({ complexity, goal, type });
    return {
        ...created,
        message: `Created ${created.type} draft/${created.slug}.`,
    };
}
function normalizeBlueprintType(type) {
    if (!type)
        return 'blueprint';
    if (type === 'blueprint' || type === 'parent-roadmap')
        return type;
    throw new Error(`Invalid blueprint type: ${type}. Valid types: blueprint, parent-roadmap`);
}
export async function executeBlueprint(slug, options = {}) {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const started = await startBlueprint(slug, { projectRoot });
    const location = await resolveBlueprintLocation(started.slug, projectRoot);
    const relativeBlueprintPath = path.relative(projectRoot, location.path).replace(/\\/g, '/');
    const launchSpec = buildBlueprintLaunchSpec({
        blueprint: location.blueprint,
        blueprintPath: relativeBlueprintPath,
        blueprintSlug: location.slug,
    });
    const launched = launchBlueprintExecution(launchSpec, projectRoot);
    try {
        await initializeBlueprintExecutionProgressBridge(launchSpec, launched.executionId, projectRoot);
    }
    catch (error) {
        try {
            controlBlueprintExecution(launchSpec.backend, 'stop', launched.executionId, projectRoot);
        }
        catch {
            // Best effort cleanup only.
        }
        return recordLaunchFailure(location.path, projectRoot, launchSpec.backend, launched.executionId, `Failed to initialize blueprint execution progress bridge: ${error instanceof Error ? error.message : String(error)}`);
    }
    await persistBlueprintExecutionMetadata(location.path, {
        backend: launchSpec.backend,
        executionId: launched.executionId,
        status: 'running',
        updatedAt: nowIsoTimestamp(),
    });
    await writeBlueprintRuntimeSnapshot(projectRoot, {
        backend: launchSpec.backend,
        executionId: launched.executionId,
        status: 'running',
        updatedAt: nowIsoTimestamp(),
    });
    const runtime = await describeBlueprintExecutionRuntime(location.path);
    await persistBlueprintExecutionArtifacts(location.path, {
        artifacts: runtime.paths.artifactPaths,
        logPath: runtime.paths.logPath,
        verifications: [],
    });
    return {
        action: 'launch',
        artifactPaths: runtime.paths.artifactPaths,
        backend: launched.backend,
        bridgePath: runtime.paths.bridgePath,
        executionId: launched.executionId,
        launchSpec,
        logPath: runtime.paths.logPath,
        message: `Launched blueprint ${started.slug} via ${launched.backend}.`,
        output: launched.output,
        runtimeSnapshotPath: runtime.paths.runtimeSnapshotPath,
        slug: started.slug,
        status: runtime.status,
        teamStateRoot: runtime.paths.teamStateRoot,
    };
}
export async function controlBlueprintExec(action, slug, options = {}) {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const location = await resolveBlueprintLocation(slug, projectRoot);
    const metadata = await readBlueprintExecutionState(location.path);
    if (!metadata) {
        throw new Error(`Blueprint ${location.slug} has no stored execution metadata. Launch it with wp blueprint exec <slug> first.`);
    }
    if (action === 'stop') {
        const control = controlBlueprintExecution(metadata.backend, action, metadata.executionId, projectRoot);
        await writeBlueprintRuntimeSnapshot(projectRoot, {
            backend: metadata.backend,
            executionId: metadata.executionId,
            status: 'stopped',
            updatedAt: nowIsoTimestamp(),
        });
        const evidence = await buildStoppedRuntimeEvidence(location.path);
        const reconciled = await reconcileBlueprintRuntimeSnapshot(projectRoot, location.path, location.slug, {
            backend: metadata.backend,
            executionId: metadata.executionId,
            status: 'stopped',
            updatedAt: nowIsoTimestamp(),
        }, evidence);
        const runtime = await describeBlueprintExecutionRuntime(reconciled.path);
        return {
            action,
            artifactPaths: runtime.paths.artifactPaths,
            backend: metadata.backend,
            bridgePath: runtime.paths.bridgePath,
            executionId: metadata.executionId,
            logPath: runtime.paths.logPath,
            message: `Stopped blueprint ${location.slug} via ${metadata.backend}.`,
            output: control.output,
            runtimeSnapshotPath: runtime.paths.runtimeSnapshotPath,
            slug: location.slug,
            status: runtime.status,
            teamStateRoot: runtime.paths.teamStateRoot,
        };
    }
    const control = controlBlueprintExecution(metadata.backend, action, metadata.executionId, projectRoot);
    const sync = await syncBlueprintExecutionProgress(location.path, location.slug, projectRoot, {
        evidence: action === 'status'
            ? {
                artifacts: [],
                verifications: [`omx team status ${metadata.executionId}`],
            }
            : undefined,
    });
    const runtime = await describeBlueprintExecutionRuntime(sync.blueprintPath);
    return {
        action,
        artifactPaths: runtime.paths.artifactPaths,
        backend: metadata.backend,
        bridgePath: runtime.paths.bridgePath,
        executionId: metadata.executionId,
        logPath: runtime.paths.logPath,
        message: `${action === 'resume' ? 'Resumed' : 'Checked'} blueprint ${location.slug} via ${metadata.backend}.`,
        output: control.output,
        runtimeSnapshotPath: runtime.paths.runtimeSnapshotPath,
        slug: location.slug,
        status: sync.status,
        teamStateRoot: runtime.paths.teamStateRoot,
    };
}
export async function readBlueprintExecutionLogs(slug, options = {}) {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const location = await resolveBlueprintLocation(slug, projectRoot);
    const runtime = await describeBlueprintExecutionRuntime(location.path);
    return {
        action: 'logs',
        artifactPaths: runtime.paths.artifactPaths,
        backend: runtime.backend,
        bridgePath: runtime.paths.bridgePath,
        executionId: runtime.executionId,
        logPath: runtime.paths.logPath,
        message: `Execution runtime paths for blueprint ${location.slug}.`,
        output: '',
        runtimeSnapshotPath: runtime.paths.runtimeSnapshotPath,
        slug: location.slug,
        status: runtime.status,
        teamStateRoot: runtime.paths.teamStateRoot,
    };
}
export async function moveBlueprint(slug, status, options = {}) {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const nextStatus = normalizeBlueprintStatus(status);
    const location = await resolveBlueprintLocation(slug, projectRoot);
    const sourceDir = path.dirname(location.path);
    const targetDir = path.join(resolveBlueprintRoot(projectRoot), nextStatus, relativeBlueprintSlug(location.slug));
    const targetPath = path.join(targetDir, '_overview.md');
    if (sourceDir === targetDir && location.blueprint.status === nextStatus) {
        return {
            fromPath: location.path,
            fromStatus: location.blueprint.status,
            message: `Blueprint ${location.slug} is already in ${nextStatus}.`,
            moved: false,
            slug: location.slug,
            toPath: location.path,
            toStatus: nextStatus,
            updated: false,
        };
    }
    if (!options.forceRecovery) {
        throw new Error('Blueprint move is recovery-only. Use wp blueprint start/task/finalize for normal lifecycle changes, or pass --force-recovery.');
    }
    assertBlueprintCanMoveToStatus(location.blueprint, nextStatus);
    if (sourceDir !== targetDir) {
        await mkdir(path.dirname(targetDir), { recursive: true });
        await rename(sourceDir, targetDir);
    }
    const updated = await writeBlueprintWithStatus(targetPath, location.blueprint, nextStatus);
    return {
        fromPath: location.path,
        fromStatus: location.blueprint.status,
        message: sourceDir === targetDir
            ? `Updated blueprint ${location.slug} to ${nextStatus}.`
            : `Moved blueprint ${location.slug} to ${nextStatus}.`,
        moved: sourceDir !== targetDir,
        slug: location.slug,
        toPath: targetPath,
        toStatus: nextStatus,
        updated,
    };
}
export async function startBlueprint(slug, options = {}) {
    return applyLifecycleMutation(slug, { type: 'start' }, resolveProjectRoot(options.projectRoot));
}
export async function parkBlueprint(slug, options = {}) {
    return applyLifecycleMutation(slug, { type: 'park' }, resolveProjectRoot(options.projectRoot));
}
export async function finalizeBlueprint(slug, options = {}) {
    return applyLifecycleMutation(slug, { type: 'finalize' }, resolveProjectRoot(options.projectRoot));
}
export async function mutateBlueprintTask(action, slug, taskId, options = {}) {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const intent = action === 'start'
        ? { type: 'task_start', taskId }
        : action === 'block'
            ? { type: 'task_block', taskId, reason: options.reason ?? '' }
            : action === 'unblock'
                ? { type: 'task_unblock', taskId }
                : { type: 'task_complete', taskId };
    return applyLifecycleMutation(slug, intent, projectRoot);
}
export async function auditBlueprints(options = {}) {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const stagedFiles = options.staged ? readStagedFiles(projectRoot) : undefined;
    return runBlueprintAudit({
        all: options.all ?? !options.staged,
        projectRoot,
        stagedFiles,
        strict: options.strict,
    });
}
export async function exportBlueprint(slug, format, options = {}) {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const location = await resolveBlueprintLocation(slug, projectRoot);
    const raw = await readFile(location.path, 'utf-8');
    const parsed = parseBlueprintForDb(raw, location.path, location.slug);
    const bundle = blueprintToSpecKit(parsed, projectRoot);
    const outDir = path.join(path.dirname(location.path), 'spec-kit');
    await mkdir(outDir, { recursive: true });
    const fileMap = {
        'spec.md': bundle.spec,
        'plan.md': bundle.plan,
        'tasks.md': bundle.tasks,
        'constitution.md': bundle.constitution,
    };
    const sizes = {};
    for (const [name, content] of Object.entries(fileMap)) {
        const dest = path.join(outDir, name);
        await writeFile(dest, content, 'utf-8');
        sizes[name] = Buffer.byteLength(content, 'utf-8');
    }
    const rel = path.relative(projectRoot, outDir);
    return {
        format,
        message: `Exported to ${rel}/`,
        outputDir: outDir,
        files: sizes,
    };
}
export async function advanceBlueprintTask(slug, taskId, toStatus, options = {}) {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const VALID_STATUSES = ['todo', 'in-progress', 'blocked', 'done', 'dropped'];
    const isValid = (s) => VALID_STATUSES.includes(s);
    if (!isValid(toStatus)) {
        throw new Error(`Invalid task status: ${toStatus}. Valid values: ${VALID_STATUSES.join(', ')}`);
    }
    return advanceTaskMutation(projectRoot, slug, taskId, toStatus);
}
export async function promoteBlueprintToState(slug, toState, options = {}) {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const VALID_STATES = ['planned', 'in-progress', 'completed', 'parked'];
    const isValid = (s) => VALID_STATES.includes(s);
    if (!isValid(toState)) {
        throw new Error(`Invalid blueprint state: ${toState}. Valid values: ${VALID_STATES.join(', ')}`);
    }
    return promoteBlueprintMutation(projectRoot, slug, toState);
}
export async function finalizeBlueprintBySlug(slug, options = {}) {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    return finalizeBlueprintMutation(projectRoot, slug);
}
export function registerBlueprintRouter(cli) {
    cli
        .command('blueprint [subcommand] [...args]', 'Manage blueprints. Use: wp blueprint <action> --help for action-specific options (new, list, show, audit, exec, move, finalize, start, task)')
        .option('--json', 'Print JSON output')
        .option('--no-tui', 'Use plain terminal output')
        .option('--complexity <complexity>', 'Blueprint complexity (XS|S|M|L|XL)')
        .option('--type <type>', 'Blueprint type (blueprint|parent-roadmap)')
        .option('--format <format>', 'Export format (spec-kit)')
        .option('--force-recovery', 'Bypass lifecycle guards for blueprint move')
        .option('--reason <text>', 'Blocked reason for task block')
        .option('--params <json>', 'JSON params for wp blueprint db query')
        .option('--to <status>', 'Target status for task advance (todo|in-progress|blocked|done|dropped)')
        .option('--staged', 'Audit only staged files')
        .option('--all', 'Audit all blueprints')
        .option('--strict', 'Enable strict audit mode')
        .option('--template <name>', 'Template name to scaffold new blueprint from (see --list-templates)')
        .option('--list-templates', 'List available template names and exit')
        .option('--templates-dir <path>', 'Override the templates directory (default: docs/templates/)')
        .action(async (subcommand, args, options) => {
        try {
            await executeBlueprintSubcommand(subcommand, args, options, {
                advanceBlueprintTask,
                auditBlueprints,
                createBlueprint,
                controlBlueprintExec,
                executeBlueprint,
                exportBlueprint,
                finalizeBlueprint,
                finalizeBlueprintBySlug,
                formatBlueprintAudit,
                formatBlueprintCreation,
                formatBlueprintDetails,
                formatBlueprintExecution,
                formatBlueprintSummaries,
                getHelpText: getBlueprintHelpText,
                listBlueprints,
                moveBlueprint,
                mutateBlueprintTask,
                parkBlueprint,
                printBlueprintOutput,
                promoteBlueprintToState,
                readBlueprintExecutionLogs,
                showBlueprint,
                startBlueprint,
            });
        }
        catch (error) {
            if (error instanceof BlueprintAuditFailedError) {
                process.exit(1);
            }
            handleBlueprintError(error);
        }
    });
}
//# sourceMappingURL=router.js.map