export declare const BLUEPRINTS_ROOT = "webpresso/blueprints";
export declare const TECH_DEBT_ROOT = "webpresso/tech-debt";
/**
 * Returns true if the path is under any accepted blueprints root.
 * Pass `blueprintsRoot` to restrict to a single configured root.
 */
export declare function isBlueprintPath(filePath: string, blueprintsRoot?: string): boolean;
export declare function getNonCanonicalPlanningPathViolation(filePath: string, blueprintsRoot?: string, techDebtRoot?: string): string | null;
/**
 * Returns true if the path is the canonical `_overview.md` location for any
 * accepted blueprints root layout (or the explicitly provided root).
 */
export declare function isCanonicalBlueprintOverviewPath(filePath: string, blueprintsRoot?: string): boolean;
export declare function isCanonicalBlueprintDocumentPath(filePath: string, blueprintsRoot?: string): boolean;
export declare function getBlueprintPathViolation(filePath: string, blueprintsRoot?: string, cwd?: string): string | null;
//# sourceMappingURL=path-contract.d.ts.map