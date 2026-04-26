import type { ToolInput, ValidationResult } from '../../shared/types.js'

import { getFilePath } from '../../shared/types.js'
import { validateBlueprint as validateBlueprintShared } from '../../shared/validators/blueprint.js'

export function validateBlueprint(input: ToolInput): ValidationResult {
  const filePath = getFilePath(input)
  const result = validateBlueprintShared(filePath)

  if (result.details?.skipReason) {
    return { validator: 'blueprint', passed: true, skipped: true, skipReason: result.details.skipReason }
  }

  return { validator: 'blueprint', passed: result.valid }
}
