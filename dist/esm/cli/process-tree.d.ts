import type { spawn } from "node:child_process";
export interface ProcessTreeTerminationOptions {
    readonly signal?: NodeJS.Signals;
    readonly escalationSignal?: NodeJS.Signals;
    readonly escalationDelayMs?: number;
}
export declare function signalProcessTree(child: ReturnType<typeof spawn>, signal?: NodeJS.Signals): void;
export declare function terminateProcessTreeWithEscalation(child: ReturnType<typeof spawn>, options?: ProcessTreeTerminationOptions): () => void;
//# sourceMappingURL=process-tree.d.ts.map