import type { SearchHit } from "#session-memory/types.js";
import { type SessionElision } from "#mcp/_session-elision.js";
export declare const MAX_CAPTURE_BYTES: number;
export interface SessionCommandResult {
    readonly label: string;
    readonly exitCode: number;
    readonly outputBytes: number;
    readonly indexed: boolean;
    readonly summary: string;
    readonly backend: "native" | "typescript";
    readonly fallbackReason?: string;
    readonly truncated?: boolean;
    readonly capturedBytes?: number;
    readonly maxCaptureBytes?: number;
    readonly timedOut?: boolean;
    readonly signal?: NodeJS.Signals;
    readonly elisions?: readonly SessionElision[];
    readonly warnings?: readonly string[];
}
interface RunSessionCommandOptions {
    readonly command: string;
    readonly label: string;
    readonly cwd: string;
    readonly projectRoot: string;
    readonly timeoutMs: number;
    readonly dbPath?: string;
}
export declare function validateCommand(command: string, cwd: string, projectRoot: string): void;
export declare function runSessionCommand({ command, label, cwd, projectRoot, timeoutMs, dbPath, }: RunSessionCommandOptions): Promise<SessionCommandResult>;
export declare function searchSessionCommandOutput(dbPath: string, labels: readonly string[], query: string, limit?: number): SearchHit[];
export {};
//# sourceMappingURL=_session-command.d.ts.map