import { z } from 'zod'

export const WEBPRESSO_CONFIG_FILE_NAME = 'webpresso.config.ts'
export const WEBPRESSO_CONFIG_EXPORT_NAME = 'webpressoConfig'
export const AGENT_KIT_CONFIG_FILE_NAME = 'agent-kit.config.ts'
export const AGENT_KIT_CONFIG_EXPORT_NAME = 'agentKitConfig'
export const WEBPRESSO_CONFIG_CANDIDATES = [
  {
    fileName: AGENT_KIT_CONFIG_FILE_NAME,
    exportName: AGENT_KIT_CONFIG_EXPORT_NAME,
  },
  {
    fileName: WEBPRESSO_CONFIG_FILE_NAME,
    exportName: WEBPRESSO_CONFIG_EXPORT_NAME,
  },
] as const

const wranglerEnvNameSchema = z
  .string()
  .min(1, 'wranglerEnvName must not be empty.')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'wranglerEnvName must be dash-safe lowercase letters, numbers, and hyphens only.',
  )

const e2eWebpressoConfigSchema = z
  .object({
    hostAdapterModule: z.string().min(1, 'e2e.hostAdapterModule must not be empty.'),
    hostAdapterExport: z.string().min(1, 'e2e.hostAdapterExport must not be empty.').optional(),
  })
  .strict()

const cloudflareDeployLaneSchema = z
  .object({
    wranglerEnvName: wranglerEnvNameSchema,
  })
  .strict()

const previewPrCloudflareDeployLaneSchema = z
  .object({
    wranglerEnvNamePattern: z
      .string()
      .min(1, 'wranglerEnvNamePattern must not be empty.')
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*-<n>$/,
        'wranglerEnvNamePattern must be dash-safe and end with -<n>.',
      ),
  })
  .strict()

const productionCloudflareDeployLaneSchema = cloudflareDeployLaneSchema.extend({
  wranglerEnvName: wranglerEnvNameSchema.refine((value) => value === 'production', {
    message: 'deploy.cloudflare.lanes.prd.wranglerEnvName must be "production".',
  }),
  deployedWorkerNameMode: z.literal('top_level_name'),
})

const cloudflareRouteSpecSchema = z
  .object({
    pattern: z.string().min(1, 'routeSpec.pattern must not be empty.'),
  })
  .strict()

const cloudflareDurableObjectBindingSchema = z
  .object({
    name: z.string().min(1, 'durableObjectBindings[].name must not be empty.'),
    className: z.string().min(1, 'durableObjectBindings[].className must not be empty.'),
    scriptName: z
      .string()
      .min(1, 'durableObjectBindings[].scriptName must not be empty.')
      .optional(),
  })
  .strict()

const cloudflareTargetSchema = z
  .object({
    id: z.string().min(1, 'deploy.cloudflare.targets[].id must not be empty.'),
    type: z.enum(['single_worker', 'worker_plus_assets', 'monorepo_multi_target']),
    topLevelWorkerName: z.string().min(1, 'topLevelWorkerName must not be empty.'),
    previewTransport: z.enum(['custom_domain_env', 'workers_dev_env']),
    routeSpec: cloudflareRouteSpecSchema.optional(),
    durableObjectBindings: z.array(cloudflareDurableObjectBindingSchema).optional(),
    vars: z.record(z.string(), z.unknown()),
    requiredSecrets: z.array(z.string().min(1, 'requiredSecrets[] must not be empty.')),
    storageMode: z.enum(['isolated', 'shared_via_script_name']),
    destroyMode: z.literal('wrangler_delete_env'),
    repoCleanupHook: z.string().min(1, 'repoCleanupHook must not be empty.').optional(),
    blastRadiusDoc: z.string().min(1, 'blastRadiusDoc must not be empty.').optional(),
    productionStrategyDefault: z.enum(['direct', 'gradual']),
  })
  .strict()
  .superRefine((target, ctx) => {
    const isDurableObjectTarget = (target.durableObjectBindings?.length ?? 0) > 0

    if (target.previewTransport === 'custom_domain_env' && !target.routeSpec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['routeSpec'],
        message: 'routeSpec is required when previewTransport is "custom_domain_env".',
      })
    }

    if (isDurableObjectTarget && target.previewTransport !== 'custom_domain_env') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['previewTransport'],
        message:
          'Durable Object targets must use previewTransport "custom_domain_env" unless a future explicit exception contract is introduced.',
      })
    }

    if (isDurableObjectTarget && Object.keys(target.vars).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vars'],
        message: 'Durable Object targets must declare at least one env-specific var.',
      })
    }

    if (isDurableObjectTarget && target.requiredSecrets.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requiredSecrets'],
        message: 'Durable Object targets must declare at least one required secret name.',
      })
    }

    if (target.storageMode === 'shared_via_script_name' && !target.blastRadiusDoc) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blastRadiusDoc'],
        message: 'blastRadiusDoc is required when storageMode is "shared_via_script_name".',
      })
    }
  })

const cloudflareDeployConfigSchema = z
  .object({
    lanes: z
      .object({
        dev: cloudflareDeployLaneSchema,
        preview_main: cloudflareDeployLaneSchema,
        preview_pr: previewPrCloudflareDeployLaneSchema,
        prd: productionCloudflareDeployLaneSchema,
      })
      .strict(),
    production: z
      .object({
        metadataPath: z.literal('infra/release-metadata.production.json'),
      })
      .strict(),
    targets: z.array(cloudflareTargetSchema),
  })
  .strict()

const deployWebpressoConfigSchema = z
  .object({
    adapterModule: z.string().min(1, 'deploy.adapterModule must not be empty.').optional(),
    adapterExport: z.string().min(1, 'deploy.adapterExport must not be empty.').optional(),
    cloudflare: cloudflareDeployConfigSchema.optional(),
  })
  .strict()

const webpressoConfigSchema = z
  .object({
    e2e: e2eWebpressoConfigSchema.optional(),
    deploy: deployWebpressoConfigSchema.optional(),
  })
  .strict()

export type WebpressoConfig = z.infer<typeof webpressoConfigSchema>
export type WebpressoE2eConfig = NonNullable<WebpressoConfig['e2e']>

export class WebpressoConfigValidationError extends Error {
  public readonly issues: Array<{ path: string; message: string }>

  constructor(
    public readonly configPath: string,
    issues: Array<{ path: string; message: string }>,
  ) {
    const formattedIssues = issues.map((issue) => `  - ${issue.path}: ${issue.message}`).join('\n')

    super(`Invalid webpresso config at ${configPath}:\n${formattedIssues}`)
    this.name = 'WebpressoConfigValidationError'
    this.issues = issues
  }
}

export function defineWebpressoConfig<TConfig extends WebpressoConfig>(config: TConfig): TConfig {
  return config
}

export function validateWebpressoConfig(config: unknown, configPath: string): WebpressoConfig {
  const result = webpressoConfigSchema.safeParse(config)
  if (!result.success) {
    throw new WebpressoConfigValidationError(
      configPath,
      result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '<root>',
        message: issue.message,
      })),
    )
  }

  return result.data
}
