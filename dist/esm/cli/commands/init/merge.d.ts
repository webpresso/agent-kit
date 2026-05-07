export type MergeAction = 'created' | 'identical' | 'drifted' | 'overwritten' | 'sidecar-written' | 'skipped-dry';
export interface MergeOptions {
    overwrite?: boolean;
    dryRun?: boolean;
}
export interface MergeResult {
    targetPath: string;
    action: MergeAction;
    sidecarPath?: string;
    note?: string;
}
export declare function writeFileMerged(targetPath: string, incoming: string, opts?: MergeOptions): MergeResult;
/**
 * Copy a single file from the catalog to the consumer, applying merge policy.
 */
export declare function copyFileMerged(sourcePath: string, targetPath: string, opts?: MergeOptions): MergeResult;
/**
 * Recursively copy a directory. Applies merge policy to every file.
 * Returns one MergeResult per file processed.
 */
export declare function copyDirectoryMerged(sourceDir: string, targetDir: string, opts?: MergeOptions): MergeResult[];
/**
 * Read, patch, and write a JSON file. The patcher receives the parsed object
 * (or `{}` if the file doesn't exist) and returns the new object to write.
 *
 * Unlike raw template files, structured JSON patch targets are merged in-place:
 * the patcher already preserves unknown fields, so writing a `.new` sidecar
 * would strand required hook/config updates behind an extra manual merge step.
 */
export declare function patchJsonFile(targetPath: string, patcher: (existing: Record<string, unknown>) => Record<string, unknown>, opts?: MergeOptions): MergeResult;
export declare function summarizeResults(results: readonly MergeResult[]): Record<MergeAction, number>;
//# sourceMappingURL=merge.d.ts.map