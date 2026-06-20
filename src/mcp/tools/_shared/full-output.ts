import { applyOutputTransform, type TransformResult } from '#output-transforms/index'

import { stripTransform } from './runner-failure.js'
import { createSessionElisionRecorder } from '#mcp/tools/_session-elision.js'

export function formatMcpToolOutput(
  rawOutput: string | undefined,
  options: { readonly full?: boolean; readonly toolName: string; readonly cwd?: string },
): Omit<TransformResult, 'transform'> {
  if (!rawOutput) return {}
  if (options.full) return { rawOutput }
  return stripTransform(
    applyOutputTransform(rawOutput, {
      toolName: options.toolName,
      elisionRecorder: createSessionElisionRecorder({
        cwd: options.cwd,
        sourcePrefix: options.toolName,
      }),
    }),
  )
}
