import { z } from 'zod'

export const AGENT_KIT_CONFIG_FILE_NAME = 'agent-kit.config.ts'
export const AGENT_KIT_CONFIG_EXPORT_NAME = 'agentKitConfig'

const e2eAgentKitConfigSchema = z
  .object({
    hostAdapterModule: z.string().min(1, 'e2e.hostAdapterModule must not be empty.'),
    hostAdapterExport: z.string().min(1, 'e2e.hostAdapterExport must not be empty.').optional(),
  })
  .strict()

const agentKitConfigSchema = z
  .object({
    e2e: e2eAgentKitConfigSchema.optional(),
  })
  .strict()

export type AgentKitConfig = z.infer<typeof agentKitConfigSchema>
export type AgentKitE2eConfig = NonNullable<AgentKitConfig['e2e']>

export class AgentKitConfigValidationError extends Error {
  public readonly issues: Array<{ path: string; message: string }>

  constructor(
    public readonly configPath: string,
    issues: Array<{ path: string; message: string }>,
  ) {
    const formattedIssues = issues.map((issue) => `  - ${issue.path}: ${issue.message}`).join('\n')

    super(`Invalid agent-kit config at ${configPath}:\n${formattedIssues}`)
    this.name = 'AgentKitConfigValidationError'
    this.issues = issues
  }
}

export function defineAgentKitConfig<TConfig extends AgentKitConfig>(config: TConfig): TConfig {
  return config
}

export function validateAgentKitConfig(config: unknown, configPath: string): AgentKitConfig {
  const result = agentKitConfigSchema.safeParse(config)
  if (!result.success) {
    throw new AgentKitConfigValidationError(
      configPath,
      result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '<root>',
        message: issue.message,
      })),
    )
  }

  return result.data
}
