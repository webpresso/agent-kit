import type { ChildProcess } from "node:child_process";
export declare const PROCESS_TREE_FORCE_KILL_GRACE_MS = 5000;
export declare function exitCodeFromSignal(signal: NodeJS.Signals | null): number;
export declare function killProcessTree(child: Pick<ChildProcess, "pid" | "kill">, signal: NodeJS.Signals): void;
export declare function forceKillProcessTree(child: Pick<ChildProcess, "pid" | "kill">): void;
//# sourceMappingURL=process-supervisor.d.ts.map