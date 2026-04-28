import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { applyRuntimeProgressSnapshot, blueprintProgressBridgeStateSchema, blueprintLaunchSpecSchema, buildBlueprintProgressBridgeState, clearBlueprintExecutionArtifacts, clearBlueprintExecutionMetadata, DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT, normalizeOmxTeamTaskSnapshot, projectBlueprintLifecycleFromRuntime, readBlueprintExecutionArtifacts, readBlueprintExecutionMetadata, resolveBlueprintProgressBridgePath, runtimeSnapshotPathForExecution, runtimeStateSnapshotSchema, writeBlueprintExecutionArtifacts, writeBlueprintExecutionMetadata, } from '#index';
import { applyBlueprintLifecycleToFile, parseBlueprint } from '#local';
import { resolveBlueprintRoot } from '#utils/blueprint-root';
export const realExecutionCommandRunner = {
    exec: (command, args, options) => execFileSync(command, args, {
        cwd: options.cwd,
        encoding: 'utf-8',
    }).trim(),
};
function toTaskLaunchSpec(task) {
    return {
        backendHints: {
            longRunning: task.stepType === 'implement' || task.stepType === 'research',
            testHeavy: task.stepType === 'test-fix' || task.stepType === 'verify',
        },
        dependsOn: task.depends ?? [],
        files: task.targetFile ? [task.targetFile] : [],
        id: task.id,
        title: task.title,
        verificationCommands: [],
    };
}
function countReadyTasks(tasks) {
    return tasks.filter((task) => task.dependsOn.length === 0).length;
}
function nowIsoTimestamp() {
    return new Date().toISOString();
}
function toProjectRelativePath(projectRoot, targetPath) {
    return path.relative(projectRoot, targetPath).replace(/\\/g, '/');
}
function uniqueStrings(values) {
    return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}
function resolveRuntimeSnapshotRelativePath(executionId, runtimeStateRoot = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT) {
    return runtimeSnapshotPathForExecution(executionId, runtimeStateRoot);
}
function resolveTeamStateRelativePath(executionId, runtimeStateRoot = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT) {
    return `${runtimeStateRoot.replace(/\/+$/u, '')}/team/${executionId}`;
}
function resolveBridgeRelativePath(backend, executionId, runtimeStateRoot = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT) {
    return resolveBlueprintProgressBridgePath(runtimeStateRoot, backend, executionId);
}
function buildListTasksVerificationCommand(executionId) {
    return `omx team api list-tasks --input '${JSON.stringify({ team_name: executionId })}' --json`;
}
function isMissingFileError(error) {
    return (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string' &&
        error.code === 'ENOENT');
}
export function buildBlueprintLaunchSpec(input) {
    const tasks = input.blueprint.tasks.map(toTaskLaunchSpec);
    const suggestedParallelism = Math.max(1, Math.min(3, countReadyTasks(tasks)));
    return blueprintLaunchSpecSchema.parse({
        backend: 'omx-team',
        blueprintPath: input.blueprintPath,
        blueprintSlug: input.blueprintSlug,
        mode: 'durable',
        policy: {
            maxParallelism: suggestedParallelism,
            runtimeStateRoot: DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
        },
        tasks,
    });
}
function buildTeamPrompt(spec) {
    const taskLines = spec.tasks.map((task) => {
        const details = [
            task.dependsOn.length > 0 ? `depends on ${task.dependsOn.join(', ')}` : null,
            task.files.length > 0 ? `files ${task.files.join(', ')}` : null,
            task.verificationCommands.length > 0
                ? `verify with ${task.verificationCommands.join(' && ')}`
                : null,
        ]
            .filter(Boolean)
            .join('; ');
        return `- Task ${task.id}: ${task.title}${details ? ` (${details})` : ''}`;
    });
    return [
        `Execute blueprint ${spec.blueprintSlug}.`,
        `Blueprint path: ${spec.blueprintPath}.`,
        'Treat the blueprint as the source of truth.',
        'Use the OMX team task queue below as the execution substrate.',
        ...taskLines,
        'Verify changed work before reporting completion.',
    ].join('\n');
}
export function buildBlueprintExecutionLaunchCommand(spec) {
    const workerCount = spec.policy.maxParallelism ?? 1;
    return {
        args: ['team', `${workerCount}:executor`, buildTeamPrompt(spec)],
        command: 'omx',
        workerCount,
    };
}
function parseTeamExecutionId(output) {
    const match = output.match(/Team started:\s*([^\n]+)/i);
    if (!match?.[1]) {
        throw new Error('Could not determine OMX team identity from launch output.');
    }
    return match[1].trim();
}
export function launchBlueprintExecution(spec, projectRoot, runner = realExecutionCommandRunner) {
    const launch = buildBlueprintExecutionLaunchCommand(spec);
    const output = runner.exec(launch.command, launch.args, { cwd: projectRoot });
    return {
        ...launch,
        backend: spec.backend,
        executionId: parseTeamExecutionId(output),
        output,
    };
}
export function buildBlueprintExecutionControlCommand(backend, action, executionId) {
    if (backend !== 'omx-team') {
        throw new Error(`Unsupported execution backend for control command: ${backend}`);
    }
    const subcommand = action === 'stop' ? 'shutdown' : action;
    return {
        args: ['team', subcommand, executionId],
        command: 'omx',
    };
}
export async function persistBlueprintExecutionMetadata(blueprintPath, metadata) {
    const raw = await readFile(blueprintPath, 'utf-8');
    const updated = writeBlueprintExecutionMetadata(raw, metadata);
    await writeFile(blueprintPath, updated, 'utf-8');
}
export async function readBlueprintExecutionState(blueprintPath) {
    const raw = await readFile(blueprintPath, 'utf-8');
    return readBlueprintExecutionMetadata(raw);
}
export async function clearBlueprintExecutionState(blueprintPath) {
    const raw = await readFile(blueprintPath, 'utf-8');
    const updated = clearBlueprintExecutionArtifacts(clearBlueprintExecutionMetadata(raw));
    await writeFile(blueprintPath, updated, 'utf-8');
}
function normalizeEvidenceArray(values) {
    return values.map((value) => value.trim()).filter((value) => value.length > 0);
}
function normalizeCompletionEvidence(evidence) {
    return {
        artifacts: normalizeEvidenceArray(evidence.artifacts),
        logPath: evidence.logPath?.trim() || undefined,
        verifications: normalizeEvidenceArray(evidence.verifications),
    };
}
function mergeExecutionArtifacts(current, next) {
    const normalized = normalizeCompletionEvidence(next);
    return {
        artifacts: uniqueStrings([...(current?.artifacts ?? []), ...normalized.artifacts]),
        logPath: normalized.logPath ?? current?.logPath,
        verifications: uniqueStrings([...(current?.verifications ?? []), ...normalized.verifications]),
    };
}
function assertCompletionEvidence(evidence, executionId) {
    if (!evidence || evidence.verifications.length === 0) {
        throw new Error(`Blueprint execution ${executionId} cannot record completion without named verification output.`);
    }
    if (evidence.artifacts.length === 0 && !evidence.logPath) {
        throw new Error(`Blueprint execution ${executionId} cannot record completion without artifact or log identity.`);
    }
    return evidence;
}
export async function persistBlueprintExecutionArtifacts(blueprintPath, evidence) {
    const raw = await readFile(blueprintPath, 'utf-8');
    const updated = writeBlueprintExecutionArtifacts(raw, normalizeCompletionEvidence(evidence));
    await writeFile(blueprintPath, updated, 'utf-8');
}
export async function readBlueprintExecutionArtifactsState(blueprintPath) {
    const raw = await readFile(blueprintPath, 'utf-8');
    return readBlueprintExecutionArtifacts(raw);
}
function parseOmxTeamApiResponse(output, operation) {
    let parsed;
    try {
        parsed = JSON.parse(output);
    }
    catch (error) {
        throw new Error(`Failed to parse OMX team api ${operation} response: ${error instanceof Error ? error.message : String(error)}`, {
            cause: error,
        });
    }
    if (!parsed.ok) {
        throw new Error(parsed.error?.message ||
            `OMX team api ${operation} failed${parsed.error?.code ? ` (${parsed.error.code})` : ''}.`);
    }
    if (!parsed.data) {
        throw new Error(`OMX team api ${operation} returned no data.`);
    }
    return parsed.data;
}
function runOmxTeamApi(operation, input, projectRoot, runner) {
    const output = runner.exec('omx', ['team', 'api', operation, '--input', JSON.stringify(input), '--json'], { cwd: projectRoot });
    return parseOmxTeamApiResponse(output, operation);
}
function resolveBridgeAbsolutePath(projectRoot, backend, executionId, runtimeStateRoot = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT) {
    return path.join(projectRoot, resolveBridgeRelativePath(backend, executionId, runtimeStateRoot));
}
function resolveRuntimeSnapshotAbsolutePath(projectRoot, executionId, runtimeStateRoot = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT) {
    return path.join(projectRoot, resolveRuntimeSnapshotRelativePath(executionId, runtimeStateRoot));
}
export function buildBlueprintExecutionRuntimePaths(backend, executionId, artifacts) {
    const bridgePath = resolveBridgeRelativePath(backend, executionId);
    const runtimeSnapshotPath = resolveRuntimeSnapshotRelativePath(executionId);
    const teamStateRoot = resolveTeamStateRelativePath(executionId);
    return {
        artifactPaths: uniqueStrings([
            runtimeSnapshotPath,
            bridgePath,
            teamStateRoot,
            ...(artifacts?.artifacts ?? []),
        ]),
        bridgePath,
        logPath: artifacts?.logPath,
        runtimeSnapshotPath,
        teamStateRoot,
    };
}
export async function describeBlueprintExecutionRuntime(blueprintPath) {
    const metadata = await readBlueprintExecutionState(blueprintPath);
    if (!metadata) {
        throw new Error('Blueprint execution metadata is required before runtime paths can be described.');
    }
    const artifacts = await readBlueprintExecutionArtifactsState(blueprintPath);
    return {
        artifacts,
        backend: metadata.backend,
        executionId: metadata.executionId,
        paths: buildBlueprintExecutionRuntimePaths(metadata.backend, metadata.executionId, artifacts),
        status: metadata.status,
    };
}
export async function persistBlueprintProgressBridgeState(projectRoot, bridge, runtimeStateRoot = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT) {
    const bridgePath = resolveBridgeAbsolutePath(projectRoot, bridge.backend, bridge.executionId, runtimeStateRoot);
    await mkdir(path.dirname(bridgePath), { recursive: true });
    await writeFile(bridgePath, JSON.stringify(bridge, null, 2), 'utf-8');
    return bridgePath;
}
export async function readBlueprintProgressBridgeState(projectRoot, backend, executionId, runtimeStateRoot = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT) {
    const bridgePath = resolveBridgeAbsolutePath(projectRoot, backend, executionId, runtimeStateRoot);
    const raw = await readFile(bridgePath, 'utf-8');
    return blueprintProgressBridgeStateSchema.parse(JSON.parse(raw));
}
export async function writeBlueprintRuntimeSnapshot(projectRoot, snapshot, runtimeStateRoot = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT) {
    const parsed = runtimeStateSnapshotSchema.parse(snapshot);
    const snapshotPath = resolveRuntimeSnapshotAbsolutePath(projectRoot, parsed.executionId, runtimeStateRoot);
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, JSON.stringify(parsed, null, 2), 'utf-8');
    return snapshotPath;
}
export async function readBlueprintRuntimeSnapshot(projectRoot, executionId, runtimeStateRoot = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT) {
    const snapshotPath = resolveRuntimeSnapshotAbsolutePath(projectRoot, executionId, runtimeStateRoot);
    const raw = await readFile(snapshotPath, 'utf-8');
    return runtimeStateSnapshotSchema.parse(JSON.parse(raw));
}
async function readBlueprintRuntimeSnapshotIfPresent(projectRoot, executionId) {
    try {
        return await readBlueprintRuntimeSnapshot(projectRoot, executionId);
    }
    catch (error) {
        if (isMissingFileError(error)) {
            return null;
        }
        throw error;
    }
}
export async function reconcileBlueprintRuntimeSnapshot(projectRoot, blueprintPath, slug, snapshot, evidence) {
    const parsedSnapshot = runtimeStateSnapshotSchema.parse(snapshot);
    const raw = await readFile(blueprintPath, 'utf-8');
    const persistedEvidence = readBlueprintExecutionArtifacts(raw);
    const mergedEvidence = evidence
        ? mergeExecutionArtifacts(persistedEvidence, evidence)
        : persistedEvidence;
    const completionEvidence = parsedSnapshot.status === 'completed'
        ? assertCompletionEvidence(mergedEvidence, parsedSnapshot.executionId)
        : mergedEvidence;
    const result = applyRuntimeProgressSnapshot(raw, slug, parsedSnapshot);
    const nextStatus = result.blueprint.status;
    const currentDir = path.dirname(blueprintPath);
    const currentStatus = currentDir
        .split(`${path.sep}webpresso${path.sep}blueprints${path.sep}`)[1]
        ?.split(path.sep)[0] ??
        currentDir.split(`${path.sep}blueprints${path.sep}`)[1]?.split(path.sep)[0];
    const relativeSlug = slug.replace(/^[^/]+\//u, '');
    const blueprintsRoot = resolveBlueprintRoot(projectRoot);
    const targetDir = path.join(blueprintsRoot, nextStatus, relativeSlug);
    const targetPath = path.join(targetDir, '_overview.md');
    const nextMarkdown = completionEvidence
        ? writeBlueprintExecutionArtifacts(result.markdown, completionEvidence)
        : result.markdown;
    if (currentDir !== targetDir && currentStatus && currentStatus !== nextStatus) {
        await mkdir(path.dirname(targetDir), { recursive: true });
        await rename(currentDir, targetDir);
        await writeFile(targetPath, nextMarkdown, 'utf-8');
    }
    else {
        await writeFile(blueprintPath, nextMarkdown, 'utf-8');
    }
    return {
        moved: currentDir !== targetDir,
        path: currentDir !== targetDir ? targetPath : blueprintPath,
        status: result.execution.status,
    };
}
export function listOmxTeamTasks(executionId, projectRoot, runner = realExecutionCommandRunner) {
    const data = runOmxTeamApi('list-tasks', { team_name: executionId }, projectRoot, runner);
    return (data.tasks ?? []).map((task) => normalizeOmxTeamTaskSnapshot(task));
}
async function waitForOmxTeamTasks(spec, projectRoot, executionId, runner) {
    let lastTasks = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
        lastTasks = listOmxTeamTasks(executionId, projectRoot, runner);
        if (lastTasks.length >= spec.tasks.length) {
            return lastTasks;
        }
        await delay(200);
    }
    if (!lastTasks.length) {
        throw new Error(`OMX team ${executionId} did not expose any runtime tasks for bridge setup.`);
    }
    return lastTasks;
}
export async function initializeBlueprintExecutionProgressBridge(spec, executionId, projectRoot, runner = realExecutionCommandRunner) {
    const runtimeTasks = await waitForOmxTeamTasks(spec, projectRoot, executionId, runner);
    const bridge = buildBlueprintProgressBridgeState(spec, executionId, runtimeTasks, nowIsoTimestamp());
    await persistBlueprintProgressBridgeState(projectRoot, bridge, spec.policy.runtimeStateRoot);
    return bridge;
}
async function ensureBlueprintExecutionProgressBridge(blueprintPath, slug, projectRoot, metadata, runner) {
    try {
        return await readBlueprintProgressBridgeState(projectRoot, metadata.backend, metadata.executionId);
    }
    catch (error) {
        if (!isMissingFileError(error)) {
            throw error;
        }
    }
    const raw = await readFile(blueprintPath, 'utf-8');
    const blueprint = parseBlueprint(raw, slug);
    const spec = buildBlueprintLaunchSpec({
        blueprint,
        blueprintPath: toProjectRelativePath(projectRoot, blueprintPath),
        blueprintSlug: slug,
    });
    return initializeBlueprintExecutionProgressBridge(spec, metadata.executionId, projectRoot, runner);
}
export async function syncBlueprintExecutionProgress(blueprintPath, slug, projectRoot, options = {}) {
    const runner = options.runner ?? realExecutionCommandRunner;
    const metadata = await readBlueprintExecutionState(blueprintPath);
    if (!metadata) {
        throw new Error('Blueprint execution metadata is required before progress can be synchronized.');
    }
    const raw = await readFile(blueprintPath, 'utf-8');
    const storedArtifacts = readBlueprintExecutionArtifacts(raw);
    const bridge = await ensureBlueprintExecutionProgressBridge(blueprintPath, slug, projectRoot, {
        backend: metadata.backend,
        executionId: metadata.executionId,
    }, runner);
    const runtimeTasks = listOmxTeamTasks(metadata.executionId, projectRoot, runner);
    const blueprint = parseBlueprint(raw, slug);
    const projection = projectBlueprintLifecycleFromRuntime(blueprint, bridge, runtimeTasks);
    const runtimeSnapshotPath = await writeBlueprintRuntimeSnapshot(projectRoot, {
        backend: metadata.backend,
        executionId: metadata.executionId,
        status: projection.status,
        updatedAt: nowIsoTimestamp(),
    });
    const runtimePaths = buildBlueprintExecutionRuntimePaths(metadata.backend, metadata.executionId, storedArtifacts);
    const evidence = mergeExecutionArtifacts(storedArtifacts, {
        artifacts: uniqueStrings([
            ...runtimePaths.artifactPaths,
            toProjectRelativePath(projectRoot, runtimeSnapshotPath),
            ...(options.evidence?.artifacts ?? []),
        ]),
        logPath: options.evidence?.logPath ?? runtimePaths.logPath,
        verifications: uniqueStrings([
            buildListTasksVerificationCommand(metadata.executionId),
            ...(options.evidence?.verifications ?? []),
        ]),
    });
    if (projection.intents.some((intent) => intent.type === 'task_complete' || intent.type === 'finalize')) {
        assertCompletionEvidence(evidence, metadata.executionId);
    }
    let currentPath = blueprintPath;
    for (const intent of projection.intents) {
        const mutation = await applyBlueprintLifecycleToFile(projectRoot, bridge.blueprintSlug, intent);
        currentPath = mutation.path;
    }
    let currentMarkdown = await readFile(currentPath, 'utf-8');
    currentMarkdown = writeBlueprintExecutionMetadata(currentMarkdown, {
        backend: metadata.backend,
        executionId: metadata.executionId,
        status: projection.status,
        updatedAt: nowIsoTimestamp(),
    });
    currentMarkdown = writeBlueprintExecutionArtifacts(currentMarkdown, evidence);
    await writeFile(currentPath, currentMarkdown, 'utf-8');
    return {
        blueprintPath: currentPath,
        bridgePath: runtimePaths.bridgePath,
        executionId: metadata.executionId,
        runtimeSnapshotPath: toProjectRelativePath(projectRoot, runtimeSnapshotPath),
        status: projection.status,
        teamStateRoot: runtimePaths.teamStateRoot,
    };
}
export function controlBlueprintExecution(backend, action, executionId, projectRoot, runner = realExecutionCommandRunner) {
    const command = buildBlueprintExecutionControlCommand(backend, action, executionId);
    return {
        backend,
        executionId,
        output: runner.exec(command.command, command.args, { cwd: projectRoot }),
        status: action === 'stop' ? 'stopped' : 'running',
    };
}
export async function recordLaunchFailure(blueprintPath, projectRoot, backend, executionId, reason) {
    await persistBlueprintExecutionMetadata(blueprintPath, {
        backend,
        executionId,
        status: 'failed',
        updatedAt: nowIsoTimestamp(),
    });
    await writeBlueprintRuntimeSnapshot(projectRoot, {
        backend,
        executionId,
        status: 'failed',
        updatedAt: nowIsoTimestamp(),
    });
    const runtime = await describeBlueprintExecutionRuntime(blueprintPath);
    await persistBlueprintExecutionArtifacts(blueprintPath, {
        artifacts: runtime.paths.artifactPaths,
        logPath: runtime.paths.logPath,
        verifications: [],
    });
    throw new Error(reason);
}
export async function buildStoppedRuntimeEvidence(blueprintPath) {
    const runtime = await describeBlueprintExecutionRuntime(blueprintPath);
    return {
        artifacts: runtime.paths.artifactPaths,
        logPath: runtime.paths.logPath,
        verifications: [],
    };
}
export async function readStoredRuntimeSnapshotStatus(blueprintPath, projectRoot) {
    const metadata = await readBlueprintExecutionState(blueprintPath);
    if (!metadata) {
        return null;
    }
    const snapshot = await readBlueprintRuntimeSnapshotIfPresent(projectRoot, metadata.executionId);
    return snapshot?.status ?? null;
}
//# sourceMappingURL=execution.js.map