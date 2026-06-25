import type { ValidationResult } from "#hooks/shared/types";

export function createSkipResult(
  validator: string,
  skipReason = "Bypass enabled via FORBIDDEN_COMMANDS_SKIP=1 — exceptional cases only; restore guardrails immediately after the bypass run",
): ValidationResult {
  return { validator, passed: true, skipped: true, skipReason };
}
