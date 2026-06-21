import { z } from 'zod';
import { type RunOutcome } from './_shared/run-command.js';
export declare const readonlyOpsBaseSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    directory: z.ZodOptional<z.ZodString>;
    maxOutputBytes: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    timeoutMs: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, z.core.$strict>;
export type ReadonlyOpsBaseInput = z.infer<typeof readonlyOpsBaseSchema>;
export interface CommandDetails {
    readonly command: string;
    readonly args: readonly string[];
}
export interface ReadonlyCommandResult {
    readonly id: string;
    readonly command: CommandDetails;
    readonly passed: boolean;
    readonly exitCode?: number;
    readonly timedOut?: boolean;
    readonly aborted?: boolean;
    readonly missingBinary?: boolean;
    readonly rawOutput?: string;
    readonly truncated?: true;
    readonly logPath?: string;
    readonly warnings?: string[];
    readonly details?: unknown;
}
export declare function resolveReadonlyCwd(input: Pick<ReadonlyOpsBaseInput, 'cwd' | 'directory'>): string;
export declare function parseJsonObject(text: string): Record<string, unknown> | undefined;
export declare function runReadonlyCommand(id: string, command: string, args: readonly string[], options: {
    readonly cwd: string;
    readonly timeoutMs: number;
    readonly maxOutputBytes: number;
    readonly signal?: AbortSignal;
    readonly parseJson?: boolean;
}): Promise<ReadonlyCommandResult>;
export declare function normalizeCommandOutcome(id: string, command: CommandDetails, outcome: RunOutcome, options: {
    readonly maxOutputBytes: number;
    readonly parseJson?: boolean;
}): ReadonlyCommandResult;
export declare function summarizeCommands(label: string, commands: readonly ReadonlyCommandResult[]): string;
export declare function commandCounts(commands: readonly ReadonlyCommandResult[]): Record<string, number>;
//# sourceMappingURL=_readonly-ops.d.ts.map