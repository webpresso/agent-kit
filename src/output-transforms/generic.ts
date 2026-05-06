import type { Failure, TransformContext, TransformResult } from './index.js'
import { createTransformResult } from './metadata.js'

const ERROR_LINE_RE = /error|fail|✗|✘/iu

export function genericTransform(
  rawOutput: string | undefined,
  context: TransformContext,
): TransformResult {
  if (!rawOutput) {
    return createTransformResult('', '', context, {
      tier: 3,
      failures: [],
      legacyTier: 'registered',
    })
  }

  const failures: Failure[] = rawOutput
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && ERROR_LINE_RE.test(line))
    .map((line) => ({ message: line }))

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
