import type { ParsedBlueprintForDb } from '#db/parser/blueprint-db-parser';
export interface SpecKitBundle {
    readonly spec: string;
    readonly plan: string;
    readonly tasks: string;
    readonly constitution: string;
}
/**
 * Convert a parsed blueprint to spec-kit's 4-file structure.
 * Each file is a non-empty string; no content is duplicated across files.
 */
export declare function blueprintToSpecKit(parsed: ParsedBlueprintForDb, repoRoot: string): SpecKitBundle;
//# sourceMappingURL=index.d.ts.map