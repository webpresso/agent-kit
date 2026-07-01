import type { ToolInput, ValidationResult } from "#hooks/shared/types";
import type { DuplicateFunctionResult } from "./package-imports.types.js";
export type { DuplicateFunctionResult } from "./package-imports.types.js";
export interface ValidatePackageImportsOptions {
    profile?: "generic" | "webpresso";
}
export declare const VALIDATOR_NAME = "package-imports";
export declare const SKIP_ENV_VAR = "PACKAGE_IMPORTS_SKIP";
export declare function validatePackageImports(input: ToolInput, options?: ValidatePackageImportsOptions): ValidationResult | DuplicateFunctionResult;
//# sourceMappingURL=package-imports.d.ts.map