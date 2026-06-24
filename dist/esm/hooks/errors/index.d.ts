import type { WriteStream } from 'node:tty';
export declare const HOOK_FALLBACK_ACTIONS: readonly ["fail-closed-deny", "emit-empty-json", "fail-open"];
export type HookFallbackAction = (typeof HOOK_FALLBACK_ACTIONS)[number];
export type HookErrorEntry = {
    readonly timestamp: string;
    readonly binName: string;
    readonly hookName: string;
    readonly event: string;
    readonly phase: string;
    readonly fallback: HookFallbackAction;
    readonly status?: number;
    readonly signal?: string;
    readonly detail?: string;
};
export type RecordHookErrorInput = Omit<HookErrorEntry, 'timestamp'>;
export interface HooksErrorsOptions {
    readonly json?: boolean;
    readonly limit?: number;
    readonly cwd?: string;
}
export declare function resolveHookErrorsPath(cwd?: string): string;
export declare function readHookErrors(cwd?: string): readonly HookErrorEntry[];
export declare function recordHookError(input: RecordHookErrorInput, cwd?: string): void;
export declare function formatHookErrors(entries: readonly HookErrorEntry[], limit?: number): string;
export declare function hooksErrorsCommand(args?: readonly string[], stdout?: Pick<WriteStream, 'write'>, options?: HooksErrorsOptions): Promise<void>;
//# sourceMappingURL=index.d.ts.map