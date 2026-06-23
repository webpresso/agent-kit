import type { SessionElision, SessionElisionRecorder } from '#mcp/_session-elision';
export interface TransformContext {
    readonly toolName: string;
    readonly normalizedToolName: string;
    readonly maxChars?: number;
    readonly persistOverflow?: boolean;
    readonly elisionRecorder?: Pick<SessionElisionRecorder, 'record'>;
}
export interface Failure {
    readonly file?: string;
    readonly line?: number;
    readonly code?: string;
    readonly message: string;
}
export interface TransformResult {
    readonly rawOutput?: string;
    readonly truncated?: true;
    readonly logPath?: string;
    readonly failures?: readonly Failure[];
    readonly tier?: 1 | 2 | 3;
    readonly bytes?: number;
    readonly tokensSaved?: number;
    readonly elisions?: readonly SessionElision[];
    readonly warnings?: readonly string[];
    readonly transform?: {
        readonly toolName: string;
        readonly normalizedToolName: string;
        readonly tier: 'passthrough' | 'registered';
        readonly rawBytes: number;
    };
}
export type OutputTransform = (rawOutput: string | undefined, context: TransformContext) => TransformResult;
export declare function registerTransform(toolName: string, transform: OutputTransform): void;
export declare function clearTransformsForTest(): void;
export declare function normalizeToolName(toolName: string): string;
export declare function applyOutputTransform(rawOutput: string | undefined, context: Omit<TransformContext, 'normalizedToolName'>): TransformResult;
export declare const applyTransform: typeof applyOutputTransform;
//# sourceMappingURL=index.d.ts.map