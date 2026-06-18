import { applyOutputTransform, type TransformResult } from '#output-transforms/index'

import { stripTransform } from './runner-failure.js'

export function formatMcpToolOutput(
  rawOutput: string | undefined,
  options: { readonly full?: boolean; readonly toolName: string },
): Omit<TransformResult, 'transform'> {
  if (!rawOutput) return {}
  if (options.full) return { rawOutput }
  return stripTransform(applyOutputTransform(rawOutput, { toolName: options.toolName }))
}
