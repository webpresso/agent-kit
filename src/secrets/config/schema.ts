import { z } from 'zod'

import { BUILTIN_SECRET_PROVIDER_TYPES, type SecretProviderDefinition } from '#secrets/providers/types.js'
import { BUILTIN_SECRET_SINKS, type SecretSinkDefinition } from '#secrets/sinks/types.js'

const PROJECT_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/u

const ProviderDefinitionSchema = z.object({
  type: z.enum(BUILTIN_SECRET_PROVIDER_TYPES),
  workspace: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  project: z.string().regex(PROJECT_SLUG_PATTERN, 'Invalid project slug'),
})

const ProfileDefinitionSchema = z.object({
  provider: z.string().min(1),
  environment: z.string().min(1),
})

const SinkDefinitionSchema = z.object({
  defaultProfile: z.string().min(1),
  allowedOps: z.array(z.string().min(1)).min(1),
})

export const SecretOrchestrationConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    providers: z.object({
      default: ProviderDefinitionSchema,
    }).catchall(ProviderDefinitionSchema),
    profiles: z.record(z.string().min(1), ProfileDefinitionSchema),
    sinks: z.record(z.string().min(1), SinkDefinitionSchema),
  })
  .superRefine((config, ctx) => {
    for (const [profileName, profile] of Object.entries(config.profiles)) {
      if (!(profile.provider in config.providers)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['profiles', profileName, 'provider'],
          message: `Unknown provider "${profile.provider}" for profile "${profileName}"`,
        })
      }
    }

    for (const [sinkName, sink] of Object.entries(config.sinks)) {
      if (!BUILTIN_SECRET_SINKS.includes(sinkName as (typeof BUILTIN_SECRET_SINKS)[number])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sinks', sinkName],
          message: `Unsupported sink "${sinkName}"`,
        })
      }
      if (!(sink.defaultProfile in config.profiles)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sinks', sinkName, 'defaultProfile'],
          message: `Unknown default profile "${sink.defaultProfile}" for sink "${sinkName}"`,
        })
      }
    }
  })

export type SecretOrchestrationConfig = z.infer<typeof SecretOrchestrationConfigSchema>

export function parseSecretOrchestrationConfig(value: unknown): SecretOrchestrationConfig {
  return SecretOrchestrationConfigSchema.parse(value)
}

export function getDefaultSecretProvider(
  config: SecretOrchestrationConfig,
): SecretProviderDefinition | undefined {
  return config.providers.default
}

export function isSecretOrchestrationConfig(value: unknown): value is SecretOrchestrationConfig {
  return SecretOrchestrationConfigSchema.safeParse(value).success
}

export function asSecretSinkDefinitionMap(
  config: SecretOrchestrationConfig,
): Record<string, SecretSinkDefinition> {
  return config.sinks
}
