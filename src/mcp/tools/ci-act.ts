import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'

import { DEFAULT_CI_ACT_TIMEOUT_MS, MAX_CI_ACT_TIMEOUT_MS } from '#cli/commands/ci'
import {
  buildPublicCiActCommand,
  preparePublicCiActExecution,
  resolveCiActSecretEnvProfile,
  resolveCiActExecutionMode,
  sanitizePublicCiActArgv,
} from '#ci/act-runner.js'
import { isSecretGateRuntimeProfile, runSecretGateCommand } from '#secret-gate/runner.js'
import { clipRawOutput, createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'
import { resolveProjectRoot } from './_shared/project-root.js'
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
    envProfile: z
      .string()
      .optional()
      .default('secrets-only')
      .refine((value) => isSecretGateRuntimeProfile(value), {
        message:
          'envProfile is a secret-gate runtime profile (none, public, secrets-only, service-runtime, database, full). Use secretProfile for repo-owned secret selectors.',
      }),
    secretProfile: z.string().optional(),
    mode: z.enum(['direct', 'replay']).optional().default('direct'),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .max(MAX_CI_ACT_TIMEOUT_MS)
      .optional()
      .default(DEFAULT_CI_ACT_TIMEOUT_MS),
    containerArchitecture: z.string().optional(),
    platformImage: z.string().optional().default('ghcr.io/catthehacker/ubuntu:full-latest'),
    execute: z.boolean().optional().default(false),
  })
  .strict()

const outputSchema = createSummaryOutputSchema({
  details: z.object({
    command: z.object({ command: z.string(), args: z.array(z.string()) }),
    envProfile: z.string(),
    mode: z.enum(['dry-run', 'execute']),
    nonSecurityEquivalent: z.object({ command: z.string(), args: z.array(z.string()) }),
    secretEnvProfile: z.string().optional(),
  }),
})

function publicCommandDetails(input: z.infer<typeof inputSchema>, cwd: string) {
  const command = sanitizePublicCiActArgv(buildPublicCiActCommand({ ...input, cwd }))
  return { command: command.command, args: [...command.args] }
}

function nonSecurityEquivalentDetails(input: z.infer<typeof inputSchema>, cwd: string) {
  const command = sanitizePublicCiActArgv(buildPublicCiActCommand({ ...input, cwd }))
  return { command: 'act', args: [...command.actArgs] }
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
    const cwd = resolveProjectRoot(input.cwd ? { cwd: input.cwd } : {})
    const command = buildPublicCiActCommand({ ...input, cwd })
    if (!input.execute) {
      return createSummaryResult({
        passed: true,
        summary: `ci-act dry-run prepared via env profile ${input.envProfile}`,
        details: {
          command: publicCommandDetails(input, cwd),
          envProfile: input.envProfile,
          mode: 'dry-run',
          nonSecurityEquivalent: nonSecurityEquivalentDetails(input, cwd),
          secretEnvProfile: input.secretEnvProfile,
        },
      })
    }

    const result = await runSecretGateCommand({
      cwd,
      envProfile: input.envProfile,
      secretEnvProfile: input.secretEnvProfile,
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
          command: publicCommandDetails(input, cwd),
          envProfile: input.envProfile,
          mode: 'execute',
          nonSecurityEquivalent: nonSecurityEquivalentDetails(input, cwd),
          secretEnvProfile: input.secretEnvProfile,
        },
        toolExecutionFailed ? { isError: true } : {},
      )
    } finally {
      prepared.cleanup()
    }
  },
}

export default tool
