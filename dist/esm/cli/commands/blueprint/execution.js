/**
 * execution.ts — orchestrator layer.
 *
 * Imports spec, state, and io modules and exposes the high-level actions
 * that CAC command handlers call. No direct node:fs/promises usage here.
 */
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { applyRuntimeProgressSnapshot, buildBlueprintProgressBridgeState, normalizeOmxTeamTaskSnapshot, projectBlueprintLifecycleFromRuntime, readBlueprintExecutionArtifacts, runtimeStateSnapshotSchema, writeBlueprintExecutionArtifacts, writeBlueprintExecutionMetadata, } from "#index";
import { applyBlueprintLifecycleToFile, parseBlueprint } from "#local";
import { resolveBlueprintRoot } from "#utils/blueprint-root";
import { clearBlueprintExecutionState, persistBlueprintExecutionArtifacts, persistBlueprintExecutionMetadata, persistBlueprintProgressBridgeState, readBlueprintExecutionArtifactsState, readBlueprintExecutionState, readBlueprintProgressBridgeState, readBlueprintRuntimeSnapshot, writeBlueprintRuntimeSnapshot, } from "./execution-io.js";
import { assertCompletionEvidence, mergeExecutionArtifacts, } from "./execution-state.js";
import { buildBlueprintExecutionControlCommand, buildBlueprintExecutionLaunchCommand, buildBlueprintExecutionRuntimePaths, buildBlueprintLaunchSpec, buildListTasksVerificationCommand, isMissingFileError, nowIsoTimestamp, parseOmxTeamApiResponse, parseTeamExecutionId, resolveControlStatus, toProjectRelativePath, uniqueStrings, } from "./execution-spec.js";
import path from "node:path";
export { buildBlueprintExecutionControlCommand, buildBlueprintExecutionLaunchCommand, buildBlueprintExecutionRuntimePaths, buildBlueprintLaunchSpec, clearBlueprintExecutionState, persistBlueprintExecutionArtifacts, persistBlueprintExecutionMetadata, persistBlueprintProgressBridgeState, readBlueprintExecutionArtifactsState, readBlueprintExecutionState, readBlueprintProgressBridgeState, readBlueprintRuntimeSnapshot, writeBlueprintRuntimeSnapshot, };
export const realExecutionCommandRunner = {
    exec: (command, args, options) => execFileSync(command, args, {
        cwd: options.cwd,
        encoding: "utf-8",
    }).trim(),
};
// ---------------------------------------------------------------------------
// Runner-based helpers
// ---------------------------------------------------------------------------
function runOmxTeamApi(operation, input, projectRoot, runner) {
    const output = runner.exec("omx", ["team", "api", operation, "--input", JSON.stringify(input), "--json"], { cwd: projectRoot });
    return parseOmxTeamApiResponse(output, operation);
}
// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------
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
export async function describeBlueprintExecutionRuntime(blueprintPath) {
    const metadata = await readBlueprintExecutionState(blueprintPath);
    if (!metadata) {
        throw new Error("Blueprint execution metadata is required before runtime paths can be described.");
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
export function listOmxTeamTasks(executionId, projectRoot, runner = realExecutionCommandRunner) {
    const data = runOmxTeamApi("list-tasks", { team_name: executionId }, projectRoot, runner);
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
    const raw = await import("node:fs/promises").then((fs) => fs.readFile(blueprintPath, "utf-8"));
    const blueprint = parseBlueprint(raw, slug);
    const spec = buildBlueprintLaunchSpec({
        blueprint,
        blueprintPath: toProjectRelativePath(projectRoot, blueprintPath),
        blueprintSlug: slug,
    });
    return initializeBlueprintExecutionProgressBridge(spec, metadata.executionId, projectRoot, runner);
}
export async function reconcileBlueprintRuntimeSnapshot(projectRoot, blueprintPath, slug, snapshot, evidence) {
    const { readFile, writeFile } = await import("node:fs/promises");
    const parsedSnapshot = runtimeStateSnapshotSchema.parse(snapshot);
    const raw = await readFile(blueprintPath, "utf-8");
    const persistedEvidence = readBlueprintExecutionArtifacts(raw);
    const mergedEvidence = evidence
        ? mergeExecutionArtifacts(persistedEvidence, evidence)
        : persistedEvidence;
    const completionEvidence = parsedSnapshot.status === "completed"
        ? assertCompletionEvidence(mergedEvidence, parsedSnapshot.executionId)
        : mergedEvidence;
    const result = applyRuntimeProgressSnapshot(raw, slug, parsedSnapshot);
    const nextStatus = result.blueprint.status;
    const currentDir = path.dirname(blueprintPath);
    const blueprintsRoot = resolveBlueprintRoot(projectRoot);
    const currentStatus = currentDir.split(blueprintsRoot + path.sep)[1]?.split(path.sep)[0];
    const relativeSlug = slug.replace(/^[^/]+\//u, "");
    const targetDir = path.join(blueprintsRoot, nextStatus, relativeSlug);
    const targetPath = path.join(targetDir, "_overview.md");
    const nextMarkdown = completionEvidence
        ? writeBlueprintExecutionArtifacts(result.markdown, completionEvidence)
        : result.markdown;
    if (currentDir !== targetDir && currentStatus && currentStatus !== nextStatus) {
        const { mkdir, rename } = await import("node:fs/promises");
        await mkdir(path.dirname(targetDir), { recursive: true });
        await rename(currentDir, targetDir);
        await writeFile(targetPath, nextMarkdown, "utf-8");
    }
    else {
        await writeFile(blueprintPath, nextMarkdown, "utf-8");
    }
    return {
        moved: currentDir !== targetDir,
        path: currentDir !== targetDir ? targetPath : blueprintPath,
        status: result.execution.status,
    };
}
export async function syncBlueprintExecutionProgress(blueprintPath, slug, projectRoot, options = {}) {
    const { readFile, writeFile } = await import("node:fs/promises");
    const runner = options.runner ?? realExecutionCommandRunner;
    const metadata = await readBlueprintExecutionState(blueprintPath);
    if (!metadata) {
        throw new Error("Blueprint execution metadata is required before progress can be synchronized.");
    }
    const raw = await readFile(blueprintPath, "utf-8");
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
    if (projection.intents.some((intent) => intent.type === "task_complete" ||
        intent.type === "task_verify" ||
        intent.type === "finalize")) {
        assertCompletionEvidence(evidence, metadata.executionId);
    }
    let currentPath = blueprintPath;
    for (const intent of projection.intents) {
        const mutation = await applyBlueprintLifecycleToFile(projectRoot, bridge.blueprintSlug, intent);
        currentPath = mutation.path;
    }
    let currentMarkdown = await readFile(currentPath, "utf-8");
    currentMarkdown = writeBlueprintExecutionMetadata(currentMarkdown, {
        backend: metadata.backend,
        executionId: metadata.executionId,
        status: projection.status,
        updatedAt: nowIsoTimestamp(),
    });
    currentMarkdown = writeBlueprintExecutionArtifacts(currentMarkdown, evidence);
    await writeFile(currentPath, currentMarkdown, "utf-8");
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
        status: resolveControlStatus(action),
    };
}
export async function recordLaunchFailure(blueprintPath, projectRoot, backend, executionId, reason) {
    await persistBlueprintExecutionMetadata(blueprintPath, {
        backend,
        executionId,
        status: "failed",
        updatedAt: nowIsoTimestamp(),
    });
    await writeBlueprintRuntimeSnapshot(projectRoot, {
        backend,
        executionId,
        status: "failed",
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
export async function readStoredRuntimeSnapshotStatus(blueprintPath, projectRoot) {
    const metadata = await readBlueprintExecutionState(blueprintPath);
    if (!metadata) {
        return null;
    }
    const snapshot = await readBlueprintRuntimeSnapshotIfPresent(projectRoot, metadata.executionId);
    return snapshot?.status ?? null;
}
//# sourceMappingURL=execution.js.map