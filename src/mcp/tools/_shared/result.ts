import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

const DEFAULT_RAW_OUTPUT_LIMIT = 4_000

export const failureSchema = z.object({
  file: z.string().optional(),
  line: z.number().optional(),
  code: z.string().optional(),
  message: z.string(),
})

export const transformMetadataSchema = z.object({
  toolName: z.string(),
  normalizedToolName: z.string(),
  tier: z.enum(['passthrough', 'registered']),
  rawBytes: z.number(),
})

export const summaryFirstResultSchema = z.object({
  passed: z.boolean(),
  summary: z.string(),
  exitCode: z.number().optional(),
  backend: z.string().optional(),
  counts: z.record(z.string(), z.number()).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  rawOutput: z.string().optional(),
  truncated: z.boolean().optional(),
  timedOut: z.boolean().optional(),
  aborted: z.boolean().optional(),
  logPath: z.string().optional(),
  failures: z.array(failureSchema).optional(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  bytes: z.number().optional(),
  tokensSaved: z.number().optional(),
  transform: transformMetadataSchema.optional(),
})

type SummaryShapeOptions = {
  backend?: z.ZodTypeAny
  counts?: z.ZodTypeAny
  details?: z.ZodTypeAny
}

export function createSummaryOutputSchema(options: SummaryShapeOptions = {}) {
  const shape: Record<string, z.ZodTypeAny> = {}
  if (options.backend) shape.backend = options.backend
  if (options.counts) shape.counts = options.counts.optional()
  if (options.details) shape.details = options.details.optional()
  return summaryFirstResultSchema.extend(shape)
}

export interface SummaryFirstPayload {
  readonly passed: boolean
  readonly summary: string
  readonly [key: string]: unknown
}

export function clipRawOutput(
  rawOutput: string | undefined,
  maxChars = DEFAULT_RAW_OUTPUT_LIMIT,
  options: { toolName?: string; persistOverflow?: boolean } = {},
): { rawOutput?: string; truncated?: true; logPath?: string } {
  if (!rawOutput) return {}
  if (rawOutput.length <= maxChars) {
    return { rawOutput }
  }
  const logPath =
    options.persistOverflow !== false && options.toolName
      ? persistToolLog(options.toolName, rawOutput)
      : undefined
  return {
    rawOutput: rawOutput.slice(0, maxChars),
    truncated: true,
    ...(logPath ? { logPath } : {}),
  }
}

export function createSummaryResult<TPayload extends SummaryFirstPayload>(
  payload: TPayload,
  options: { isError?: boolean } = {},
) {
  const text = JSON.stringify(payload)
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: payload,
    ...(options.isError ? { isError: true } : {}),
  }
}

function persistToolLog(toolName: string, output: string): string {
  const now = new Date()
  const dateDir = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`
  const timeName = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  const safeToolName = toolName.replace(/[^a-zA-Z0-9_-]/gu, '-')
  const relativePath = join('logs', dateDir, `${timeName}_${safeToolName}.log`)

  mkdirSync(join(process.cwd(), 'logs', dateDir), { recursive: true })
  writeFileSync(join(process.cwd(), relativePath), output, 'utf8')

  return relativePath
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
