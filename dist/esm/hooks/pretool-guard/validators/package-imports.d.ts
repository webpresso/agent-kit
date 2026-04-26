import type { ToolInput, ValidationResult } from '../../shared/types.js';
export interface SharedFunction {
    name: string;
    package: string;
    source: string;
    category: 'string' | 'date' | 'duration' | 'format' | 'id' | 'error' | 'validation';
}
export interface DuplicateFunctionResult extends ValidationResult {
    functionName: string;
    suggestion: string;
    package: string;
    source: string;
}
export declare const VALIDATOR_NAME = "package-imports";
export declare const SKIP_ENV_VAR = "PACKAGE_IMPORTS_SKIP";
export declare const SHARED_FUNCTIONS: SharedFunction[];
export declare function validatePackageImports(input: ToolInput): ValidationResult | DuplicateFunctionResult;
//# sourceMappingURL=package-imports.d.ts.map