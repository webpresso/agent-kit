import type { RunnerTask } from "#runners/types";
export type RunnerId = "claude-subagent" | "codex-exec" | "local-worktree";
export interface SelectRunnerOptions {
    /** From --runner CLI flag */
    runner?: string;
    /** Injectable for tests; defaults to process.env */
    env?: Readonly<Record<string, string>>;
    /** Injectable: checks if cmd is on PATH. Defaults to a cross-platform PATH scan. */
    which?: (cmd: string) => boolean;
}
export declare function selectRunner(task: RunnerTask, opts?: SelectRunnerOptions): RunnerId;
//# sourceMappingURL=select.d.ts.map