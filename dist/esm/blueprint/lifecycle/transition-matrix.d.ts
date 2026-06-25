import type { LifecycleBlueprintStatus } from "#core/schema.js";
export declare function parseLifecycleBlueprintStatus(value: string): LifecycleBlueprintStatus | null;
export declare function getLegalLifecycleTargets(from: LifecycleBlueprintStatus): readonly LifecycleBlueprintStatus[];
export declare function isLegalLifecycleTransition(from: LifecycleBlueprintStatus, to: LifecycleBlueprintStatus): boolean;
//# sourceMappingURL=transition-matrix.d.ts.map