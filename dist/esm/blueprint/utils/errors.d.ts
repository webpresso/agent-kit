/**
 * Error types for plan operations.
 */
/**
 * Error thrown when a plan is not found.
 * Includes structured data for fuzzy matching and helpful error messages.
 */
export declare class BlueprintNotFoundError extends Error {
    readonly searchedPath: string;
    readonly availableSlugs: readonly string[];
    readonly requestedSlug: string;
    constructor(slug: string, searchedPath: string, availableSlugs: readonly string[]);
}
//# sourceMappingURL=errors.d.ts.map