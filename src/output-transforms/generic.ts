import type { Failure, TransformContext, TransformResult } from './index.js'
import { createTransformResult } from './metadata.js'
import { passthroughTransform } from './passthrough.js'

const ERROR_LINE_RE = /error|fail|✗|✘/iu

export function genericTransform(
  rawOutput: string | undefined,
  context: TransformContext,
): TransformResult {
  if (!rawOutput) return {}

  const failures: Failure[] = rawOutput
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && ERROR_LINE_RE.test(line))
    .map((line) => ({ message: line }))

  if (failures.length === 0) return passthroughTransform(rawOutput, context)

  return createTransformResult(
    rawOutput,
    failures.map((failure) => failure.message).join('\n'),
    context,
    {
      tier: 3,
      failures,
      legacyTier: 'registered',
    },
  )
}
