/**
 * execution-io.ts — thin I/O layer with injected writers/readers.
 *
 * All file system operations live here. The writer/reader parameters default
 * to the real `node:fs/promises` implementations so callers don't need to
 * inject anything for production use. Tests pass fakes.
 *
 * Tested by execution-io.test.ts.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { blueprintProgressBridgeStateSchema, clearBlueprintExecutionArtifacts, clearBlueprintExecutionMetadata, DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT, readBlueprintExecutionArtifacts, readBlueprintExecutionMetadata, runtimeStateSnapshotSchema, writeBlueprintExecutionArtifacts, writeBlueprintExecutionMetadata, } from '#index';
import { normalizeCompletionEvidence, } from './execution-state.js';
import { resolveBridgeAbsolutePath, resolveRuntimeSnapshotAbsolutePath } from './execution-spec.js';
// ---------------------------------------------------------------------------
// Blueprint markdown persistence (read + transform + write)
// ---------------------------------------------------------------------------
export async function persistBlueprintExecutionMetadata(blueprintPath, metadata, writer = writeFile, reader = readFile) {
    const raw = await reader(blueprintPath, 'utf-8');
    const updated = writeBlueprintExecutionMetadata(raw, metadata);
    await writer(blueprintPath, updated, 'utf-8');
}
export async function readBlueprintExecutionState(blueprintPath, reader = readFile) {
    const raw = await reader(blueprintPath, 'utf-8');
    return readBlueprintExecutionMetadata(raw);
}
export async function clearBlueprintExecutionState(blueprintPath, writer = writeFile, reader = readFile) {
    const raw = await reader(blueprintPath, 'utf-8');
    const updated = clearBlueprintExecutionArtifacts(clearBlueprintExecutionMetadata(raw));
    await writer(blueprintPath, updated, 'utf-8');
}
export async function persistBlueprintExecutionArtifacts(blueprintPath, evidence, writer = writeFile, reader = readFile) {
    const raw = await reader(blueprintPath, 'utf-8');
    const updated = writeBlueprintExecutionArtifacts(raw, normalizeCompletionEvidence(evidence));
    await writer(blueprintPath, updated, 'utf-8');
}
export async function readBlueprintExecutionArtifactsState(blueprintPath, reader = readFile) {
    const raw = await reader(blueprintPath, 'utf-8');
    return readBlueprintExecutionArtifacts(raw);
}
// ---------------------------------------------------------------------------
// Progress bridge persistence
// ---------------------------------------------------------------------------
export async function persistBlueprintProgressBridgeState(projectRoot, bridge, runtimeStateRoot = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT, writer = writeFile, dirMaker = mkdir) {
    const bridgePath = resolveBridgeAbsolutePath(projectRoot, bridge.backend, bridge.executionId, runtimeStateRoot);
    await dirMaker(path.dirname(bridgePath), { recursive: true });
    await writer(bridgePath, JSON.stringify(bridge, null, 2), 'utf-8');
    return bridgePath;
}
export async function readBlueprintProgressBridgeState(projectRoot, backend, executionId, runtimeStateRoot = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT, reader = readFile) {
    const bridgePath = resolveBridgeAbsolutePath(projectRoot, backend, executionId, runtimeStateRoot);
    const raw = await reader(bridgePath, 'utf-8');
    return blueprintProgressBridgeStateSchema.parse(JSON.parse(raw));
}
// ---------------------------------------------------------------------------
// Runtime snapshot persistence
// ---------------------------------------------------------------------------
export async function writeBlueprintRuntimeSnapshot(projectRoot, snapshot, runtimeStateRoot = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT, writer = writeFile, dirMaker = mkdir) {
    const parsed = runtimeStateSnapshotSchema.parse(snapshot);
    const snapshotPath = resolveRuntimeSnapshotAbsolutePath(projectRoot, parsed.executionId, runtimeStateRoot);
    await dirMaker(path.dirname(snapshotPath), { recursive: true });
    await writer(snapshotPath, JSON.stringify(parsed, null, 2), 'utf-8');
    return snapshotPath;
}
export async function readBlueprintRuntimeSnapshot(projectRoot, executionId, runtimeStateRoot = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT, reader = readFile) {
    const snapshotPath = resolveRuntimeSnapshotAbsolutePath(projectRoot, executionId, runtimeStateRoot);
    const raw = await reader(snapshotPath, 'utf-8');
    return runtimeStateSnapshotSchema.parse(JSON.parse(raw));
}
// ---------------------------------------------------------------------------
// Blueprint file move (lifecycle transition)
// ---------------------------------------------------------------------------
export async function moveBlueprintDirectory(currentDir, targetDir, targetPath, nextMarkdown, writer = writeFile, dirMaker = mkdir, renamer = rename) {
    await dirMaker(path.dirname(targetDir), { recursive: true });
    await renamer(currentDir, targetDir);
    await writer(targetPath, nextMarkdown, 'utf-8');
}
//# sourceMappingURL=execution-io.js.map