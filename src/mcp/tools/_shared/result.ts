import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import { RAW_BYTES_BASIS_VALUES, GAIN_PRECISION } from '#session-memory/gain-types.js'
import { sessionElisionSchema, type SessionElision } from '#mcp/tools/_session-elision-schema.js'

const DEFAULT_RAW_OUTPUT_LIMIT = 4_000
const DEFAULT_SUMMARY_TEXT_LIMIT = 240

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

export const gainTelemetrySchema = z.object({
  rawBasisBytes: z.number(),
  returnedToolResultBytes: z.number(),
  gainBytes: z.number(),
  approxTokensSaved: z.number(),
  precision: z.literal(GAIN_PRECISION),
  rawBytesBasis: z.enum(RAW_BYTES_BASIS_VALUES),
})

export const elisionSchema = sessionElisionSchema

export const summaryFirstResultSchema = z.object({
  passed: z.boolean(),
  summary: z.string(),
  exitCode: z.number().optional(),
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
  gain: gainTelemetrySchema.optional(),
  elisions: z.array(elisionSchema).optional(),
  warnings: z.array(z.string()).optional(),
  transform: transformMetadataSchema.optional(),
})

type SummaryShapeOptions = {
  counts?: z.ZodTypeAny
  details?: z.ZodTypeAny
}

export function createSummaryOutputSchema(options: SummaryShapeOptions = {}) {
  const shape: Record<string, z.ZodTypeAny> = {}
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
  options: {
    toolName?: string
    persistOverflow?: boolean
    elisionRecorder?: {
      record(input: {
        source: string
        kind: 'truncated_output'
        text: string
        returnedText?: string
        metadata?: Record<string, unknown>
      }): {
        elision?: SessionElision
        warning?: string
      }
    }
  } = {},
): {
  rawOutput?: string
  truncated?: true
  logPath?: string
  elisions?: SessionElision[]
  warnings?: string[]
} {
  if (!rawOutput) return {}
  if (rawOutput.length <= maxChars) {
    return { rawOutput }
  }
  const clipped = rawOutput.slice(0, maxChars)
  const logPath =
    options.persistOverflow !== false && options.toolName
      ? persistToolLog(options.toolName, rawOutput)
      : undefined
  const recorded = options.elisionRecorder?.record({
    source: options.toolName ?? 'tool-output',
    kind: 'truncated_output',
    text: rawOutput,
    returnedText: clipped,
    metadata: {
      toolName: options.toolName,
      reason: 'raw_output_limit',
    },
  })
  return {
    rawOutput: clipped,
    truncated: true,
    ...(logPath ? { logPath } : {}),
    ...(recorded?.elision ? { elisions: [recorded.elision] } : {}),
    ...(recorded?.warning ? { warnings: [recorded.warning] } : {}),
  }
}

export function createSummaryResult<TPayload extends SummaryFirstPayload>(
  payload: TPayload,
  options: { isError?: boolean; text?: string } = {},
) {
  const text = clipSummaryText(options.text ?? payload.summary)
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: payload,
    ...(options.isError ? { isError: true } : {}),
  }
}

function clipSummaryText(text: string): string {
  const normalized = text.trim()
  if (normalized.length <= DEFAULT_SUMMARY_TEXT_LIMIT) return normalized
  return `${normalized.slice(0, DEFAULT_SUMMARY_TEXT_LIMIT - 1).trimEnd()}…`
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
