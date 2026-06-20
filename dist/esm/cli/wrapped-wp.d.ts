export interface WrappedWpInvocation {
    readonly manager: string;
    readonly wpArgs: string[];
}
export interface WrappedWpGuidance {
    readonly tool: string;
    readonly guidance: string;
}
export interface RuntimeWrappedWpDetectionOptions {
    readonly argv?: string[];
    readonly env?: NodeJS.ProcessEnv;
    readonly platform?: NodeJS.Platform;
    readonly ppid?: number;
    readonly maxAncestorDepth?: number;
    readonly readProcessInfo?: (pid: number) => {
        ppid: number;
        command: string;
    } | null;
}
export declare function stripLeadingSecretWrappers(command: string): string;
export declare function tokenizeCommand(command: string): string[];
export declare function detectWrappedWpCommand(command: string): WrappedWpInvocation | null;
export declare function detectWrappedWpRuntimeInvocation(options?: RuntimeWrappedWpDetectionOptions): WrappedWpInvocation | null;
export declare function wrappedWpGuidanceForArgs(wpArgs: readonly string[]): WrappedWpGuidance;
export declare function formatWrappedWpInvocationError(wrapped: WrappedWpInvocation, argv: readonly string[]): string;
//# sourceMappingURL=wrapped-wp.d.ts.map