import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'

import { DEFAULT_CI_ACT_TIMEOUT_MS, MAX_CI_ACT_TIMEOUT_MS } from '#cli/commands/ci'
import {
  buildPublicCiActCommand,
  preparePublicCiActExecution,
  resolveCiActExecutionMode,
  resolveCiActSecretEnvProfile,
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

const commandDetailsSchema = z.object({ command: z.string(), args: z.array(z.string()) })

const outputSchema = createSummaryOutputSchema({
  details: z.union([
    z.object({
      command: commandDetailsSchema,
      envProfile: z.string(),
      mode: z.enum(['dry-run', 'execute']),
      nonSecurityEquivalent: commandDetailsSchema,
      secretProfile: z.string().optional(),
    }),
    z.object({
      command: commandDetailsSchema,
      envProfile: z.string(),
      mode: z.literal('replay'),
      nonSecurityEquivalent: z.literal(true),
      secretProfile: z.string().optional(),
    }),
  ]),
})

type CiActInput = z.infer<typeof inputSchema>

function publicCommandDetails(input: CiActInput, cwd: string) {
  const command = sanitizePublicCiActArgv(buildPublicCiActCommand({ ...input, cwd }))
  return { command: command.command, args: [...command.args] }
}

function nonSecurityEquivalentDetails(input: CiActInput, cwd: string) {
  const command = sanitizePublicCiActArgv(buildPublicCiActCommand({ ...input, cwd }))
  return { command: 'act', args: [...command.actArgs] }
}

function dryRunDetails(input: CiActInput, cwd: string) {
  if (resolveCiActExecutionMode(input) === 'replay') {
    return {
      command: publicCommandDetails(input, cwd),
      envProfile: input.envProfile,
      mode: 'replay' as const,
      nonSecurityEquivalent: true as const,
      secretProfile: input.secretProfile,
    }
  }

  return {
    command: publicCommandDetails(input, cwd),
    envProfile: input.envProfile,
    mode: 'dry-run' as const,
    nonSecurityEquivalent: nonSecurityEquivalentDetails(input, cwd),
    secretProfile: input.secretProfile,
  }
}

const tool: ToolDescriptor = {
  name: 'wp_ci_act',
  description:
    'Run local GitHub Actions workflows through `act` via the public secret contract (`wp config secrets ...`, then `with-secrets -- act ...`).',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'CI act',
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  handler: async (raw, extra) => {
    const input = inputSchema.parse(raw ?? {})
    const cwd = resolveProjectRoot(input.cwd ? { cwd: input.cwd } : {})
    if (!input.execute) {
      return createSummaryResult({
        passed: true,
        summary: `ci-act dry-run prepared via env profile ${input.envProfile}`,
        details: dryRunDetails(input, cwd),
      })
    }

    const prepared = preparePublicCiActExecution({ ...input, cwd })
    try {
      const result = await runSecretGateCommand({
        cwd,
        envProfile: input.envProfile,
        secretEnvProfile: resolveCiActSecretEnvProfile({ ...input, cwd }),
        command: 'act',
        args: prepared.command.actArgs,
        timeoutMs: input.timeoutMs,
        signal: extra?.signal,
      })
      const merged = [result.stdout, result.stderr].filter(Boolean).join('\n')
      const redacted = redactText(merged)
      const clipped = clipRawOutput(redacted, 4_000, { toolName: 'wp_ci_act' })
      const toolExecutionFailed = result.timedOut || result.aborted
      const details =
        prepared.mode === 'replay'
          ? {
              command: publicCommandDetails(input, cwd),
              envProfile: input.envProfile,
              mode: 'replay' as const,
              nonSecurityEquivalent: true as const,
              secretProfile: input.secretProfile,
            }
          : {
              command: publicCommandDetails(input, cwd),
              envProfile: input.envProfile,
              mode: 'execute' as const,
              nonSecurityEquivalent: nonSecurityEquivalentDetails(input, cwd),
              secretProfile: input.secretProfile,
            }
      const failures = [
        ...(prepared.nonSecurityEquivalent
          ? [
              {
                message:
                  'replay mode is a generated local approximation and is not security-equivalent to GitHub CI or OIDC',
              },
            ]
          : []),
        ...(result.timedOut ? [{ message: 'timed out while running act' }] : []),
        ...(result.aborted ? [{ message: 'aborted by client signal' }] : []),
      ]

      return createSummaryResult(
        {
          passed: result.exitCode === 0,
          summary:
            result.exitCode === 0
              ? `ci-act finished successfully via env profile ${input.envProfile}`
              : `ci-act failed with exit ${result.exitCode} via env profile ${input.envProfile}`,
          exitCode: result.exitCode,
          details,
          ...clipped,
          ...(failures.length > 0 ? { failures } : {}),
        },
        toolExecutionFailed ? { isError: true } : {},
      )
    } finally {
      prepared.cleanup()
    }
  },
}

export default tool
