import type { BlueprintExecutionBackendValue, BlueprintExecutionStatusValue } from '#core/schema';
export interface BlueprintExecutionMetadata {
    backend: BlueprintExecutionBackendValue;
    executionId: string;
    status: BlueprintExecutionStatusValue;
    updatedAt: string;
}
export declare function readBlueprintExecutionMetadata(markdown: string): BlueprintExecutionMetadata | null;
export declare function writeBlueprintExecutionMetadata(markdown: string, metadata: BlueprintExecutionMetadata): string;
export declare function clearBlueprintExecutionMetadata(markdown: string): string;
//# sourceMappingURL=metadata.d.ts.map