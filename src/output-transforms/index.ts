import { genericTransform } from './generic.js'
import { oxlintTransform } from './oxlint.js'
import { tscTransform } from './tsc.js'
import { passthroughTransform } from './passthrough.js'
import { vitestTransform } from './vitest.js'
import { shouldCompact } from './should-compact.js'

export interface TransformContext {
  readonly toolName: string
  readonly normalizedToolName: string
  readonly maxChars?: number
  readonly persistOverflow?: boolean
}

export interface Failure {
  readonly file?: string
  readonly line?: number
  readonly code?: string
  readonly message: string
}

export interface TransformResult {
  readonly rawOutput?: string
  readonly truncated?: true
  readonly logPath?: string
  readonly failures?: readonly Failure[]
  readonly tier?: 1 | 2 | 3
  readonly bytes?: number
  readonly tokensSaved?: number
  readonly transform?: {
    readonly toolName: string
    readonly normalizedToolName: string
    readonly tier: 'passthrough' | 'registered'
    readonly rawBytes: number
  }
}

export type OutputTransform = (
  rawOutput: string | undefined,
  context: TransformContext,
) => TransformResult

const builtInTransforms = new Map<string, OutputTransform>([
  ['lint-oxlint', oxlintTransform],
  ['typecheck', tscTransform],
  ['test', vitestTransform],
])
const transforms = new Map<string, OutputTransform>(builtInTransforms)

export function registerTransform(toolName: string, transform: OutputTransform): void {
  transforms.set(normalizeToolName(toolName), transform)
}

export function clearTransformsForTest(): void {
  transforms.clear()
  for (const [name, transform] of builtInTransforms) transforms.set(name, transform)
}

export function normalizeToolName(toolName: string): string {
  const withoutPrefix = toolName.replace(/^wp_/u, '')
  if (withoutPrefix.startsWith('audit-')) return 'audit'
  return withoutPrefix
}

export function applyOutputTransform(
  rawOutput: string | undefined,
  context: Omit<TransformContext, 'normalizedToolName'>,
): TransformResult {
  if (!rawOutput) return {}

  const normalizedToolName = normalizeToolName(context.toolName)
  const fullContext = { ...context, normalizedToolName }
  if (!shouldCompact()) {
    return passthroughTransform(rawOutput, fullContext)
  }

  const transform = transforms.get(normalizedToolName)
  if (transform) return transform(rawOutput, fullContext)

  return genericTransform(rawOutput, fullContext)
}

export const applyTransform = applyOutputTransform
