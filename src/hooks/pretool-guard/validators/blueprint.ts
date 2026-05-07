import type { ToolInput, ValidationResult } from '#hooks/shared/types'

import { getFilePath } from '#hooks/shared/types'
import { validateBlueprint as validateBlueprintShared } from '#hooks/shared/validators/blueprint'

export function validateBlueprint(input: ToolInput): ValidationResult {
  const filePath = getFilePath(input)
  const result = validateBlueprintShared(filePath)

  if (result.details?.skipReason) {
    return {
      validator: 'blueprint',
      passed: true,
      skipped: true,
      skipReason: result.details.skipReason,
    }
  }

  return { validator: 'blueprint', passed: result.valid }
}
