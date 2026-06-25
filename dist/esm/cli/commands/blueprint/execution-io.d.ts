/**
 * execution-io.ts — thin I/O layer with injected writers/readers.
 *
 * All file system operations live here. The writer/reader parameters default
 * to the real `node:fs/promises` implementations so callers don't need to
 * inject anything for production use. Tests pass fakes.
 *
 * Tested by execution-io.test.ts.
 */
import type { BlueprintExecutionArtifacts, BlueprintExecutionBackend, BlueprintProgressBridgeState, RuntimeStateStatus } from "#index";
import { type BlueprintExecutionCompletionEvidence } from "./execution-state.js";
export type FileReader = (p: string, enc: BufferEncoding) => Promise<string>;
export type FileWriter = (p: string, content: string, enc: BufferEncoding) => Promise<void>;
export type DirMaker = (p: string, options: {
    recursive: boolean;
}) => Promise<string | undefined>;
export type FileRenamer = (from: string, to: string) => Promise<void>;
export declare function persistBlueprintExecutionMetadata(blueprintPath: string, metadata: {
    backend: BlueprintExecutionBackend;
    executionId: string;
    status: RuntimeStateStatus;
    updatedAt: string;
}, writer?: FileWriter, reader?: FileReader): Promise<void>;
export declare function readBlueprintExecutionState(blueprintPath: string, reader?: FileReader): Promise<import("#index").BlueprintExecutionMetadata | null>;
export declare function clearBlueprintExecutionState(blueprintPath: string, writer?: FileWriter, reader?: FileReader): Promise<void>;
export declare function persistBlueprintExecutionArtifacts(blueprintPath: string, evidence: BlueprintExecutionCompletionEvidence, writer?: FileWriter, reader?: FileReader): Promise<void>;
export declare function readBlueprintExecutionArtifactsState(blueprintPath: string, reader?: FileReader): Promise<BlueprintExecutionArtifacts | null>;
export declare function persistBlueprintProgressBridgeState(projectRoot: string, bridge: BlueprintProgressBridgeState, runtimeStateRoot?: string, writer?: FileWriter, dirMaker?: DirMaker): Promise<string>;
export declare function readBlueprintProgressBridgeState(projectRoot: string, backend: BlueprintExecutionBackend, executionId: string, runtimeStateRoot?: string, reader?: FileReader): Promise<BlueprintProgressBridgeState>;
export declare function writeBlueprintRuntimeSnapshot(projectRoot: string, snapshot: {
    backend: BlueprintExecutionBackend;
    executionId: string;
    status: RuntimeStateStatus;
    taskId?: string;
    updatedAt: string;
}, runtimeStateRoot?: string, writer?: FileWriter, dirMaker?: DirMaker): Promise<string>;
export declare function readBlueprintRuntimeSnapshot(projectRoot: string, executionId: string, runtimeStateRoot?: string, reader?: FileReader): Promise<{
    backend: "omx-team" | "omx-pll-interactive" | "claude-subagent" | "codex-exec" | "local-worktree";
    executionId: string;
    status: "pending" | "running" | "blocked" | "completed" | "failed" | "stopped";
    updatedAt: string;
    evidence?: ({
        command: string;
        exit_code: number;
        result: "pass" | "fail";
        ts: string;
        kind: "test";
        agent?: string | undefined;
    } | {
        target_files: string[];
        command: string;
        exit_code: number;
        result: "pass" | "fail";
        ts: string;
        kind: "integration";
        agent?: string | undefined;
    } | {
        audit_kind: string;
        passed: boolean;
        result: "pass" | "fail";
        ts: string;
        kind: "audit";
        command?: string | undefined;
        exit_code?: number | undefined;
        agent?: string | undefined;
    } | {
        actor: string;
        description: string;
        allow_manual: true;
        log_excerpt: string;
        result: "pass" | "fail";
        ts: string;
        kind: "manual";
        agent?: string | undefined;
    })[] | undefined;
    taskId?: string | undefined;
}>;
export declare function moveBlueprintDirectory(currentDir: string, targetDir: string, targetPath: string, nextMarkdown: string, writer?: FileWriter, dirMaker?: DirMaker, renamer?: FileRenamer): Promise<void>;
export type { BlueprintExecutionArtifacts };
//# sourceMappingURL=execution-io.d.ts.map