import type { Failure, TransformContext, TransformResult } from './index.js'
import { createTransformResult } from './metadata.js'
import { passthroughTransform } from './passthrough.js'

interface VitestFailure {
  readonly file?: string
  readonly name: string
  readonly message: string
}

export function vitestTransform(
  rawOutput: string | undefined,
  context: TransformContext,
): TransformResult {
  if (!rawOutput) return {}

  const parsed = parseJsonish(rawOutput)
  if (parsed !== undefined) {
    const failures = collectFailures(parsed)
    return compact(rawOutput, context, failures, 1)
  }

  const fallback = regexFallback(rawOutput)
  if (fallback.length > 0) return compact(rawOutput, context, fallback, 2)

  return passthroughTransform(rawOutput, context)
}

function parseJsonish(rawOutput: string): unknown {
  const json = extractJson(rawOutput)
  if (!json) return undefined
  try {
    return JSON.parse(json) as unknown
  } catch {
    return undefined
  }
}

function extractJson(rawOutput: string): string | undefined {
  const start = rawOutput.search(/[[{]/u)
  if (start < 0) return undefined
  const open = rawOutput[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < rawOutput.length; index += 1) {
    const char = rawOutput[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') inString = true
    if (char === open) depth += 1
    if (char === close) depth -= 1
    if (depth === 0) return rawOutput.slice(start, index + 1)
  }
  return undefined
}

function collectFailures(value: unknown): VitestFailure[] {
  const failures: VitestFailure[] = []
  visit(value, undefined, failures)
  return failures
}

function visit(value: unknown, inheritedFile: string | undefined, failures: VitestFailure[]): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) visit(item, inheritedFile, failures)
    return
  }

  const record = value as Record<string, unknown>
  const file =
    firstString(
      record.file,
      record.filepath,
      record.filePath,
      record.name?.toString().endsWith('.ts') ? record.name : undefined,
    ) ?? inheritedFile
  const status = firstString(record.status, record.state)
  const failureMessages = Array.isArray(record.failureMessages)
    ? record.failureMessages.filter((item): item is string => typeof item === 'string')
    : typeof record.failureMessage === 'string'
      ? [record.failureMessage]
      : []

  if (status && /fail|failed/iu.test(status) && failureMessages.length > 0) {
    failures.push({
      file,
      name: firstString(record.fullName, record.title, record.name) ?? '<unnamed test>',
      message: firstStackLine(failureMessages[0] ?? 'failed'),
    })
  }

  for (const item of Object.values(record)) visit(item, file, failures)
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0)
}

function firstStackLine(message: string): string {
  return (
    message
      .split(/\r?\n/u)
      .find((line) => line.trim().length > 0)
      ?.trim() ?? message
  )
}

function regexFallback(rawOutput: string): VitestFailure[] {
  return rawOutput
    .split(/\r?\n/u)
    .filter((line) => /FAIL|failed|Error:/u.test(line))
    .slice(0, 20)
    .map((line) => ({ name: '<summary>', message: line.trim() }))
}

function compact(
  rawOutput: string,
  context: TransformContext,
  failures: readonly VitestFailure[],
  tier: 1 | 2,
): TransformResult {
  const structuredFailures: Failure[] = failures.map((failure) => ({
    file: failure.file,
    message: `${failure.name}: ${failure.message}`,
  }))
  return createTransformResult(
    rawOutput,
    failures
      .map(
        (failure) => `${failure.file ? `${failure.file} ` : ''}${failure.name}: ${failure.message}`,
      )
      .join('\n'),
    context,
    {
      tier,
      failures: structuredFailures,
    },
  )
}
