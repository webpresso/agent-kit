export declare const BLUEPRINT_OVERVIEW_FILENAME = "_overview.md";
export declare const BLUEPRINT_STATUSES: readonly ["draft", "planned", "parked", "in-progress", "completed", "archived"];
export type BlueprintStatus = (typeof BLUEPRINT_STATUSES)[number];
export type BlueprintShape = "flat" | "folder";
export interface BlueprintDocumentPath {
    relativePath: string;
    shape: BlueprintShape;
    slug: string;
    state: BlueprintStatus;
}
export declare function normalizeBlueprintPath(filePath: string): string;
export declare function isBlueprintStatus(value: string | undefined): value is BlueprintStatus;
export declare function isBlueprintSlugSegment(value: string | undefined): value is string;
export declare function parseBlueprintDocumentRelativePath(filePath: string): BlueprintDocumentPath | null;
export declare function isBlueprintSupportingMarkdownRelativePath(filePath: string): boolean;
export declare function getBlueprintDocumentPaths(root: string, state: BlueprintStatus, slug: string): {
    directory: string;
    flat: string;
    folder: string;
};
export declare function getBlueprintDocumentCandidates(root: string, slug: string): string[];
export declare function getBlueprintAlternateDocumentPath(root: string, filePath: string): string | null;
//# sourceMappingURL=document-paths.d.ts.map