/**
 * Plan Directory Scanner
 *
 * Recursively scans the blueprint directory to discover all plan _overview.md files.
 * Handles various directory structures including group/initiative, standalone, and special folders.
 */
/**
 * Represents a scanned plan with path and metadata extracted from directory structure.
 */
export interface ScannedBlueprint {
    /** Full absolute path to the _overview.md file */
    path: string;
    /** Slug derived from directory structure (e.g., 'in-progress/schema-driven-admin-ui-permissions') */
    slug: string;
    /** Parent group (e.g., 'in-progress', 'completed'), null for standalone plans */
    group: string | null;
    /** True if the plan is in a special folder (_completed, _future, _deprioritized) */
    isSpecialFolder: boolean;
    /** Type of special folder if isSpecialFolder is true */
    specialFolderType?: '_completed' | '_future' | '_deprioritized';
}
/**
 * Options for scanning the plan directory.
 */
export interface ScanOptions {
    /** Base directory to scan (default: 'webpresso/blueprints') */
    baseDir?: string;
    /** Include plans in special folders (_completed, _future, _deprioritized) (default: false) */
    includeSpecialFolders?: boolean;
}
/**
 * Generic options for scanning any document directory.
 */
export interface GenericScanOptions {
    /** Base directory to scan (relative to monorepo root or absolute) */
    baseDir: string;
    /** File pattern to match (e.g., '_overview.md', '_task.md') */
    filePattern: string;
    /** Include files in special folders (_completed, _future, _deprioritized) (default: false) */
    includeSpecialFolders?: boolean;
}
/**
 * Generic function to scan any document directory with a specified file pattern.
 *
 * @param options - Generic scan configuration options with baseDir and filePattern
 * @returns Array of scanned documents with path and metadata
 */
export declare function scanDocumentDirectory(options: GenericScanOptions): ScannedBlueprint[];
/**
 * Scan the blueprint directory for all plan _overview.md files.
 *
 * @param options - Scan configuration options
 * @returns Array of scanned plans with path and metadata
 */
export declare function scanBlueprintDirectory(options?: ScanOptions): ScannedBlueprint[];
//# sourceMappingURL=scanner.d.ts.map