#!/usr/bin/env node
import type { ToolInput, ValidationResult } from '#hooks/shared/types';
export interface AggregateResult {
    passed: boolean;
    results: ValidationResult[];
    exitCode: 0 | 2;
}
export declare function runAllValidators(input: ToolInput): AggregateResult;
export declare function formatOutput(aggregate: AggregateResult, input: ToolInput): void;
export declare function getToolType(input: ToolInput): 'Bash' | 'Write' | 'Edit';
export declare function getTarget(input: ToolInput): string;
export declare function logValidationResult(result: AggregateResult, target: string, tool: 'Bash' | 'Write' | 'Edit'): void;
export declare function handleParseError(error: unknown, inputJson: string): never;
export declare function processValidation(inputJson: string, mcpReadyFn?: () => boolean): void;
export declare function main(): Promise<void>;
//# sourceMappingURL=runner.d.ts.map