import { z } from 'zod'

import { clipRawOutput } from './_shared/result.js'
import { resolveProjectRoot } from './_shared/project-root.js'
import { redactText } from './_shared/redact.js'
import { isMissingBinary, isRunFailure, runCommand, type RunOutcome } from './_shared/run-command.js'

export const readonlyOpsBaseSchema = z
  .object({
    cwd: z.string().optional(),
    directory: z.string().optional(),
    maxOutputBytes: z.number().int().positive().max(64_000).optional().default(4_000),
    timeoutMs: z.number().int().positive().max(300_000).optional().default(120_000),
  })
  .strict()

export type ReadonlyOpsBaseInput = z.infer<typeof readonlyOpsBaseSchema>

export interface CommandDetails {
  readonly command: string
  readonly args: readonly string[]
}

export interface ReadonlyCommandResult {
  readonly id: string
  readonly command: CommandDetails
  readonly passed: boolean
  readonly exitCode?: number
  readonly timedOut?: boolean
  readonly aborted?: boolean
  readonly missingBinary?: boolean
  readonly rawOutput?: string
  readonly truncated?: true
  readonly logPath?: string
  readonly warnings?: string[]
  readonly details?: unknown
}

export function resolveReadonlyCwd(input: Pick<ReadonlyOpsBaseInput, 'cwd' | 'directory'>): string {
  return resolveProjectRoot(
    input.cwd ? { cwd: input.cwd } : input.directory ? { cwd: input.directory } : {},
  )
}

export function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  return parsed as Record<string, unknown>
}

export async function runReadonlyCommand(
  id: string,
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string
    readonly timeoutMs: number
    readonly maxOutputBytes: number
    readonly signal?: AbortSignal
    readonly parseJson?: boolean
  },
): Promise<ReadonlyCommandResult> {
  const outcome = await runCommand(command, args, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  })
  return normalizeCommandOutcome(id, { command, args }, outcome, options)
}

export function normalizeCommandOutcome(
  id: string,
  command: CommandDetails,
  outcome: RunOutcome,
  options: {
    readonly maxOutputBytes: number
    readonly parseJson?: boolean
  },
): ReadonlyCommandResult {
  if (isRunFailure(outcome)) {
    return {
      id,
      command,
      passed: false,
      missingBinary: isMissingBinary(outcome),
      warnings: [
        isMissingBinary(outcome)
          ? `missing binary: ${command.command}`
          : `failed to spawn ${command.command}: ${outcome.error.message}`,
      ],
    }
  }

  const combined = redactText([outcome.stdout, outcome.stderr].filter(Boolean).join('\n'))
  const clipped = clipRawOutput(combined, options.maxOutputBytes, {
    toolName: `wp_${id}`,
    persistOverflow: false,
  })
  const result: ReadonlyCommandResult = {
    id,
    command,
    passed: outcome.exitCode === 0,
    exitCode: outcome.exitCode,
    timedOut: outcome.timedOut || undefined,
    aborted: outcome.aborted || undefined,
    ...clipped,
  }

  if (options.parseJson && outcome.exitCode === 0) {
    try {
      const parsed = parseJsonObject(outcome.stdout)
      return parsed ? { ...result, details: parsed } : result
    } catch (error) {
      return {
        ...result,
        passed: false,
        warnings: [`could not parse JSON output from ${command.command}: ${(error as Error).message}`],
      }
    }
  }

  return result
}

export function summarizeCommands(label: string, commands: readonly ReadonlyCommandResult[]): string {
  const failed = commands.filter((command) => !command.passed).length
  if (failed === 0) return `${label} passed (${commands.length} check${commands.length === 1 ? '' : 's'})`
  return `${label} failed (${failed}/${commands.length} check${commands.length === 1 ? '' : 's'} failed)`
}

export function commandCounts(commands: readonly ReadonlyCommandResult[]): Record<string, number> {
  return {
    commandCount: commands.length,
    passedCount: commands.filter((command) => command.passed).length,
    failedCount: commands.filter((command) => !command.passed).length,
  }
}
