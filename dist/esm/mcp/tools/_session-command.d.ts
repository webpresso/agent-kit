import type { SearchHit } from '#session-memory/types.js';
export interface SessionCommandResult {
    readonly label: string;
    readonly exitCode: number;
    readonly outputBytes: number;
    readonly indexed: boolean;
    readonly summary: string;
}
interface RunSessionCommandOptions {
    readonly command: string;
    readonly label: string;
    readonly cwd: string;
    readonly timeoutMs: number;
    readonly dbPath?: string;
}
export declare function runSessionCommand({ command, label, cwd, timeoutMs, dbPath, }: RunSessionCommandOptions): Promise<SessionCommandResult>;
export declare function searchSessionCommandOutput(dbPath: string, labels: readonly string[], query: string, limit?: number): SearchHit[];
export {};
//# sourceMappingURL=_session-command.d.ts.map