import type { ValidationResult } from "#hooks/shared/types";

export interface DuplicateFunctionResult extends ValidationResult {
  functionName: string;
  suggestion: string;
  package: string;
  source: string;
}
