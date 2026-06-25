/**
 * execution-io.ts — thin I/O layer with injected writers/readers.
 *
 * All file system operations live here. The writer/reader parameters default
 * to the real `node:fs/promises` implementations so callers don't need to
 * inject anything for production use. Tests pass fakes.
 *
 * Tested by execution-io.test.ts.
 */

import type {
  BlueprintExecutionArtifacts,
  BlueprintExecutionBackend,
  BlueprintProgressBridgeState,
  RuntimeStateStatus,
} from "#index";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  blueprintProgressBridgeStateSchema,
  clearBlueprintExecutionArtifacts,
  clearBlueprintExecutionMetadata,
  DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
  readBlueprintExecutionArtifacts,
  readBlueprintExecutionMetadata,
  runtimeStateSnapshotSchema,
  writeBlueprintExecutionArtifacts,
  writeBlueprintExecutionMetadata,
} from "#index";

import {
  normalizeCompletionEvidence,
  type BlueprintExecutionCompletionEvidence,
} from "./execution-state.js";
import { resolveBridgeAbsolutePath, resolveRuntimeSnapshotAbsolutePath } from "./execution-spec.js";

// ---------------------------------------------------------------------------
// Injected I/O types
// ---------------------------------------------------------------------------

export type FileReader = (p: string, enc: BufferEncoding) => Promise<string>;
export type FileWriter = (p: string, content: string, enc: BufferEncoding) => Promise<void>;
export type DirMaker = (p: string, options: { recursive: boolean }) => Promise<string | undefined>;
export type FileRenamer = (from: string, to: string) => Promise<void>;

// ---------------------------------------------------------------------------
// Blueprint markdown persistence (read + transform + write)
// ---------------------------------------------------------------------------

export async function persistBlueprintExecutionMetadata(
  blueprintPath: string,
  metadata: {
    backend: BlueprintExecutionBackend;
    executionId: string;
    status: RuntimeStateStatus;
    updatedAt: string;
  },
  writer: FileWriter = writeFile,
  reader: FileReader = readFile,
): Promise<void> {
  const raw = await reader(blueprintPath, "utf-8");
  const updated = writeBlueprintExecutionMetadata(raw, metadata);
  await writer(blueprintPath, updated, "utf-8");
}

export async function readBlueprintExecutionState(
  blueprintPath: string,
  reader: FileReader = readFile,
) {
  const raw = await reader(blueprintPath, "utf-8");
  return readBlueprintExecutionMetadata(raw);
}

export async function clearBlueprintExecutionState(
  blueprintPath: string,
  writer: FileWriter = writeFile,
  reader: FileReader = readFile,
): Promise<void> {
  const raw = await reader(blueprintPath, "utf-8");
  const updated = clearBlueprintExecutionArtifacts(clearBlueprintExecutionMetadata(raw));
  await writer(blueprintPath, updated, "utf-8");
}

export async function persistBlueprintExecutionArtifacts(
  blueprintPath: string,
  evidence: BlueprintExecutionCompletionEvidence,
  writer: FileWriter = writeFile,
  reader: FileReader = readFile,
): Promise<void> {
  const raw = await reader(blueprintPath, "utf-8");
  const updated = writeBlueprintExecutionArtifacts(raw, normalizeCompletionEvidence(evidence));
  await writer(blueprintPath, updated, "utf-8");
}

export async function readBlueprintExecutionArtifactsState(
  blueprintPath: string,
  reader: FileReader = readFile,
) {
  const raw = await reader(blueprintPath, "utf-8");
  return readBlueprintExecutionArtifacts(raw);
}

// ---------------------------------------------------------------------------
// Progress bridge persistence
// ---------------------------------------------------------------------------

export async function persistBlueprintProgressBridgeState(
  projectRoot: string,
  bridge: BlueprintProgressBridgeState,
  runtimeStateRoot: string = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
  writer: FileWriter = writeFile,
  dirMaker: DirMaker = mkdir,
): Promise<string> {
  const bridgePath = resolveBridgeAbsolutePath(
    projectRoot,
    bridge.backend,
    bridge.executionId,
    runtimeStateRoot,
  );
  await dirMaker(path.dirname(bridgePath), { recursive: true });
  await writer(bridgePath, JSON.stringify(bridge, null, 2), "utf-8");
  return bridgePath;
}

export async function readBlueprintProgressBridgeState(
  projectRoot: string,
  backend: BlueprintExecutionBackend,
  executionId: string,
  runtimeStateRoot: string = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
  reader: FileReader = readFile,
): Promise<BlueprintProgressBridgeState> {
  const bridgePath = resolveBridgeAbsolutePath(projectRoot, backend, executionId, runtimeStateRoot);
  const raw = await reader(bridgePath, "utf-8");
  return blueprintProgressBridgeStateSchema.parse(JSON.parse(raw));
}

// ---------------------------------------------------------------------------
// Runtime snapshot persistence
// ---------------------------------------------------------------------------

export async function writeBlueprintRuntimeSnapshot(
  projectRoot: string,
  snapshot: {
    backend: BlueprintExecutionBackend;
    executionId: string;
    status: RuntimeStateStatus;
    taskId?: string;
    updatedAt: string;
  },
  runtimeStateRoot: string = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
  writer: FileWriter = writeFile,
  dirMaker: DirMaker = mkdir,
): Promise<string> {
  const parsed = runtimeStateSnapshotSchema.parse(snapshot);
  const snapshotPath = resolveRuntimeSnapshotAbsolutePath(
    projectRoot,
    parsed.executionId,
    runtimeStateRoot,
  );
  await dirMaker(path.dirname(snapshotPath), { recursive: true });
  await writer(snapshotPath, JSON.stringify(parsed, null, 2), "utf-8");
  return snapshotPath;
}

export async function readBlueprintRuntimeSnapshot(
  projectRoot: string,
  executionId: string,
  runtimeStateRoot: string = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
  reader: FileReader = readFile,
) {
  const snapshotPath = resolveRuntimeSnapshotAbsolutePath(
    projectRoot,
    executionId,
    runtimeStateRoot,
  );
  const raw = await reader(snapshotPath, "utf-8");
  return runtimeStateSnapshotSchema.parse(JSON.parse(raw));
}

// ---------------------------------------------------------------------------
// Blueprint file move (lifecycle transition)
// ---------------------------------------------------------------------------

export async function moveBlueprintDirectory(
  currentDir: string,
  targetDir: string,
  targetPath: string,
  nextMarkdown: string,
  writer: FileWriter = writeFile,
  dirMaker: DirMaker = mkdir,
  renamer: FileRenamer = rename,
): Promise<void> {
  await dirMaker(path.dirname(targetDir), { recursive: true });
  await renamer(currentDir, targetDir);
  await writer(targetPath, nextMarkdown, "utf-8");
}

// ---------------------------------------------------------------------------
// Re-export the artifact type so execution.ts can import from one place
// ---------------------------------------------------------------------------

export type { BlueprintExecutionArtifacts };
