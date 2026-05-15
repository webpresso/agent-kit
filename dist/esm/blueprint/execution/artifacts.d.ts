export interface BlueprintExecutionArtifacts {
    artifacts: string[];
    logPath?: string;
    verifications: string[];
}
export declare function readBlueprintExecutionArtifacts(markdown: string): BlueprintExecutionArtifacts | null;
export declare function writeBlueprintExecutionArtifacts(markdown: string, artifacts: BlueprintExecutionArtifacts): string;
export declare function clearBlueprintExecutionArtifacts(markdown: string): string;
//# sourceMappingURL=artifacts.d.ts.map