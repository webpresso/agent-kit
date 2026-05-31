import { z } from 'zod'

export const WEBPRESSO_CONFIG_FILE_NAME = 'webpresso.config.ts'
export const WEBPRESSO_CONFIG_EXPORT_NAME = 'webpressoConfig'

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

const productionCloudflareDeployLaneSchema = cloudflareDeployLaneSchema.extend({
  wranglerEnvName: wranglerEnvNameSchema.refine((value) => value === 'production', {
    message: 'deploy.cloudflare.lanes.prd.wranglerEnvName must be "production".',
  }),
})

const cloudflareDeployConfigSchema = z
  .object({
    lanes: z
      .object({
        dev: cloudflareDeployLaneSchema,
        preview_main: cloudflareDeployLaneSchema,
        preview_pr: cloudflareDeployLaneSchema,
        prd: productionCloudflareDeployLaneSchema,
      })
      .strict(),
  })
  .strict()

const deployWebpressoConfigSchema = z
  .object({
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
