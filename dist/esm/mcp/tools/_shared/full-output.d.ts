import { type TransformResult } from "#output-transforms/index";
export declare function formatMcpToolOutput(rawOutput: string | undefined, options: {
    readonly full?: boolean;
    readonly toolName: string;
    readonly cwd?: string;
}): Omit<TransformResult, "transform">;
//# sourceMappingURL=full-output.d.ts.map