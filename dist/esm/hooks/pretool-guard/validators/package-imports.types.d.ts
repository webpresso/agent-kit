import type { ValidationResult } from "#hooks/shared/types";
export interface DuplicateFunctionResult extends ValidationResult {
    functionName: string;
    suggestion: string;
    package: string;
    source: string;
}
//# sourceMappingURL=package-imports.types.d.ts.map