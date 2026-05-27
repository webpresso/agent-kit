import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'

import { buildPublicCiActCommand, sanitizePublicCiActArgv } from '#ci/act-runner.js'
import { runSecretGateCommand } from '#secret-gate/runner.js'
import { clipRawOutput, createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'
import { redactText } from './_shared/redact.js'

const inputSchema = z
  .object({
    cwd: z.string().optional(),
    workflowPath: z.string(),
    job: z.string().optional(),
    eventName: z
      .enum(['pull_request', 'push', 'workflow_dispatch'])
      .optional()
      .default('pull_request'),
    eventPath: z.string().optional(),
    envProfile: z.string().optional().default('secrets-only'),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .max(5 * 60_000)
      .optional()
      .default(120_000),
    containerArchitecture: z.string().optional(),
    platformImage: z.string().optional().default('ghcr.io/catthehacker/ubuntu:full-latest'),
    execute: z.boolean().optional().default(false),
  })
  .strict()

const outputSchema = createSummaryOutputSchema({
  details: z.object({
    command: z.object({ command: z.string(), args: z.array(z.string()) }),
    envProfile: z.string(),
  }),
})

function publicCommandDetails(input: z.infer<typeof inputSchema>) {
  const command = sanitizePublicCiActArgv(buildPublicCiActCommand(input))
  return { command: command.command, args: [...command.args] }
}

const tool: ToolDescriptor = {
  name: 'wp_ci_act',
  description:
    'Run local GitHub Actions workflows through `act` via the public secret contract (`wp config secrets ...`, then `with-secrets -- act ...`).',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'CI act',
    destructiveHint: false,
    openWorldHint: false,
  },
  handler: async (raw, extra) => {
    const input = inputSchema.parse(raw ?? {})
    const command = buildPublicCiActCommand(input)
    if (!input.execute) {
      return createSummaryResult({
        passed: true,
        summary: `ci-act dry-run prepared via env profile ${input.envProfile}`,
        details: {
          command: publicCommandDetails(input),
          envProfile: input.envProfile,
        },
      })
    }

    const result = await runSecretGateCommand({
      cwd: input.cwd,
      envProfile: input.envProfile,
      command: 'act',
      args: command.actArgs,
      timeoutMs: input.timeoutMs,
      signal: extra?.signal,
    })
    const merged = [result.stdout, result.stderr].filter(Boolean).join('\n')
    const redacted = redactText(merged)
    const clipped = clipRawOutput(redacted, 4_000, { toolName: 'wp_ci_act' })
    const toolExecutionFailed = result.timedOut || result.aborted
    return createSummaryResult(
      {
        passed: result.exitCode === 0,
        summary:
          result.exitCode === 0
            ? `ci-act finished successfully via env profile ${input.envProfile}`
            : `ci-act failed with exit ${result.exitCode} via env profile ${input.envProfile}`,
        exitCode: result.exitCode,
        details: {
          command: publicCommandDetails(input),
          envProfile: input.envProfile,
        },
        ...clipped,
        ...(result.timedOut ? { failures: [{ message: 'timed out while running act' }] } : {}),
        ...(result.aborted ? { failures: [{ message: 'aborted by client signal' }] } : {}),
      },
      toolExecutionFailed ? { isError: true } : {},
    )
  },
}

export default tool
