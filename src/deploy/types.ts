export type DeployLane = 'dev' | 'preview_main' | `preview_pr_${number}` | 'prd'
export type DeployMode = 'deploy' | 'destroy'
export type DeployStage =
  | 'preview_health'
  | 'health'
  | 'homepage'
  | 'production_smoke'
  | 'production_journey'

interface DeployStepBase {
  readonly id: string
  readonly label?: string
  readonly stage?: DeployStage
  readonly runtimeProfile?: string
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string | undefined>>
}

export type DeployStep =
  | (DeployStepBase & {
      readonly kind: 'command'
      readonly command: string
      readonly args?: readonly string[]
    })
  | (DeployStepBase & {
      readonly kind: 'managed-tool'
      readonly tool: string
      readonly args?: readonly string[]
    })
  | (DeployStepBase & {
      readonly kind: 'http-check'
      readonly url: string
      readonly headers?: Readonly<Record<string, string>>
      readonly expectedStatus?: number
      readonly retries?: number
      readonly intervalMs?: number
      readonly timeoutMs?: number
    })

export interface DeployPlan {
  readonly schemaVersion: 1
  readonly lane: DeployLane
  readonly mode?: DeployMode
  readonly provider: string
  readonly requiredCredentials: readonly string[]
  readonly releaseVersion?: string
  readonly steps: readonly DeployStep[]
}

export interface DeployRequest {
  readonly cwd: string
  readonly lane: DeployLane
  readonly mode: DeployMode
  readonly dryRun: boolean
  readonly env: NodeJS.ProcessEnv
  readonly releaseVersion?: string
  readonly cloudflare?: unknown
}

export interface DeployAdapter {
  readonly createPlan: (request: DeployRequest) => DeployPlan | Promise<DeployPlan>
}

export interface LoadedDeployAdapter {
  readonly adapter: DeployAdapter
  readonly config: import('#e2e/config.js').WebpressoConfig
  readonly configPath: string
  readonly moduleSpecifier: string
  readonly exportName: string
}
