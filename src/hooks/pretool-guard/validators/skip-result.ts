import type { ValidationResult } from '../../shared/types.js'

export function createSkipResult(validator: string, skipReason = 'Bypass enabled'): ValidationResult {
  return { validator, passed: true, skipped: true, skipReason }
}
