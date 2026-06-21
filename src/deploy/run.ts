import { spawnSync } from 'node:child_process'

import type { DeployLane, DeployPlan, DeployRequest, DeployStep } from './types.js'
import { loadDeployAdapter } from './load-adapter.js'
import { parseDeployLane, validateDeployPlan } from './schema.js'
import { getManagedRunner } from '#tool-runtime'
import {
  buildRuntimeProcessEnv,
  createRuntimeEnvCache,
  resolveRuntimeEnvironment,
  isDirectRuntimeProfile,
} from '#runtime/index.js'

export interface CreateDeployPlanOptions {
  readonly cwd?: string
  readonly lane: string
  readonly dryRun?: boolean
  readonly destroy?: boolean
  readonly releaseVersion?: string
}

export interface RunDeployPlanOptions extends CreateDeployPlanOptions {
  readonly planJson?: boolean
}

export async function createDeployPlan(options: CreateDeployPlanOptions): Promise<DeployPlan> {
  const cwd = options.cwd ?? process.cwd()
  const loadedAdapter = await loadDeployAdapter(cwd)
  if (!loadedAdapter) {
    throw new Error(
      'No deploy adapter configured. Add deploy.adapterModule to agent-kit.config.ts.',
    )
  }

  const lane = parseDeployLane(options.lane)
  const request: DeployRequest = {
    cwd,
    lane,
    mode: options.destroy ? 'destroy' : 'deploy',
    dryRun: Boolean(options.dryRun),
    env: process.env,
    releaseVersion: options.releaseVersion,
    cloudflare: loadedAdapter.config.deploy?.cloudflare,
  }
  return validateDeployPlan(await loadedAdapter.adapter.createPlan(request))
}

export async function runDeployPlan(options: RunDeployPlanOptions): Promise<number> {
  const plan = await createDeployPlan(options)
  if (options.planJson) {
    console.log(JSON.stringify(plan, null, 2))
    return 0
  }

  const cache = createRuntimeEnvCache()
  const cwd = options.cwd ?? process.cwd()
  for (const step of plan.steps) {
    const code = await runDeployStep(step, plan, cache, cwd)
    if (code !== 0) return code
  }
  return 0
}

async function runDeployStep(
  step: DeployStep,
  plan: DeployPlan,
  cache: ReturnType<typeof createRuntimeEnvCache>,
  defaultCwd: string,
): Promise<number> {
  const label = step.label ?? step.id
  const stageLabel = step.stage ? ` [${step.stage}]` : ''
  console.error(`[deploy]${stageLabel} ${label}`)

  if (step.kind === 'http-check') {
    return runHttpCheck(step, plan, cache, defaultCwd)
  }

  const command = resolveStepCommand(step)
  const cwd = step.cwd ?? defaultCwd
  const baseEnv = {
    ...process.env,
    ...(plan.releaseVersion ? { RELEASE_VERSION: plan.releaseVersion } : {}),
    ...step.env,
  }
  const resolvedEnv = resolveRuntimeEnvironment({
    cwd,
    profile: step.runtimeProfile,
    environment: resolveDeployStepSecretProfile(step, plan.lane),
    env: baseEnv,
    cache,
  })
  const env = buildRuntimeProcessEnv(cwd, baseEnv, resolvedEnv)

  const result = spawnSync(command.command, command.args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: false,
  })
  return result.status ?? 1
}


function resolveDeployStepSecretProfile(step: DeployStep, lane: DeployLane): string | undefined {
  const runtimeProfile = step.runtimeProfile?.trim()
  if (!runtimeProfile || isDirectRuntimeProfile(runtimeProfile)) return undefined
  return lane === 'prd' ? 'production' : 'preview'
}

function resolveStepCommand(step: Exclude<DeployStep, { kind: 'http-check' }>): {
  command: string
  args: string[]
} {
  if (step.kind === 'command') {
    return { command: step.command, args: [...(step.args ?? [])] }
  }
  const resolution = getManagedRunner(step.tool, { outputPolicy: 'structured' })
  return { command: resolution.command, args: [...resolution.args, ...(step.args ?? [])] }
}

async function runHttpCheck(
  step: Extract<DeployStep, { kind: 'http-check' }>,
  plan: DeployPlan,
  cache: ReturnType<typeof createRuntimeEnvCache>,
  defaultCwd: string,
): Promise<number> {
  const cwd = step.cwd ?? defaultCwd
  const baseEnv = { ...process.env, ...step.env }
  const resolvedEnv = resolveRuntimeEnvironment({
    cwd,
    profile: step.runtimeProfile,
    environment: resolveDeployStepSecretProfile(step, plan.lane),
    env: baseEnv,
    cache,
  })
  const env = buildRuntimeProcessEnv(cwd, baseEnv, resolvedEnv)
  const retries = step.retries ?? 1
  const intervalMs = step.intervalMs ?? 1000
  const timeoutMs = step.timeoutMs ?? 10_000
  const expectedStatus = step.expectedStatus ?? 200
  const headers = Object.fromEntries(
    Object.entries(step.headers ?? {}).map(([key, value]) => [key, interpolateEnv(value, env)]),
  )

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(step.url, {
        headers,
        signal: controller.signal,
      })
      if (response.status === expectedStatus) {
        clearTimeout(timer)
        return 0
      }
      console.error(
        `[deploy] http-check ${step.id} attempt ${attempt}/${retries} returned ${response.status} (expected ${expectedStatus})`,
      )
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.error(
        `[deploy] http-check ${step.id} attempt ${attempt}/${retries} failed: ${detail}`,
      )
    } finally {
      clearTimeout(timer)
    }

    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }

  return 1
}

function interpolateEnv(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/gu, (_match, key: string) => env[key] ?? '')
}
