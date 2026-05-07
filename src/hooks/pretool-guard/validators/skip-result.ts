import type { ValidationResult } from '#hooks/shared/types'

export function createSkipResult(
  validator: string,
  skipReason = 'Bypass enabled',
): ValidationResult {
  return { validator, passed: true, skipped: true, skipReason }
}
