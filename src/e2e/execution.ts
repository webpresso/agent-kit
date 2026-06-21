import type { CommandConfig, PlannedE2eRunGroup } from './types.js'
import type { GenericE2ePlanInput } from './run-planner.js'

import { spawn } from 'node:child_process'

import { buildRuntimeProcessEnv, resolveRuntimeEnvironment } from '#runtime/index.js'
import {
  exitCodeFromSignal,
  forceKillProcessTree,
  killProcessTree,
  PROCESS_TREE_FORCE_KILL_GRACE_MS,
} from '#shared-utils/process-supervisor.js'

import { loadConfiguredHostAdapter } from './load-host-adapter.js'
import { planE2eRun, planGenericE2eRun } from './run-planner.js'

export async function createE2eExecutionPlan(
  input: GenericE2ePlanInput,
  cwd = process.cwd(),
): Promise<PlannedE2eRunGroup[]> {
  // Explicit runner/config requests are generic-by-intent. Bypass host adapters
  // so MCP callers can force a specific runner without inheriting suite defaults
  // (e.g. host Playwright config when runner=vitest).
  if (input.runner || input.config) {
    return planGenericE2eRun({
      suite: input.suite,
      runner: input.runner,
      config: input.config,
      files: toArray(input.files),
      headed: input.headed,
      debug: input.debug,
      reuseReset: input.reuseReset,
      noSupervisor: input.noSupervisor,
      workers: input.workers,
      testList: input.testList,
      passthrough: input.passthrough,
      outputPolicy: input.outputPolicy,
      filterOutput: input.filterOutput,
    })
  }

  const hostAdapter = await loadConfiguredHostAdapter(cwd)
  const files = toArray(input.files)

  if (!hostAdapter?.adapter) {
    return planGenericE2eRun({
      suite: input.suite,
      runner: input.runner,
      config: input.config,
      files,
      headed: input.headed,
      debug: input.debug,
      reuseReset: input.reuseReset,
      noSupervisor: input.noSupervisor,
      workers: input.workers,
      testList: input.testList,
      passthrough: input.passthrough,
      outputPolicy: input.outputPolicy,
      filterOutput: input.filterOutput,
    })
  }

  if (hostAdapter.adapter.buildExecutionPlan) {
    return hostAdapter.adapter.buildExecutionPlan({
      suite: input.suite,
      file: files,
      files,
      headed: input.headed,
      debug: input.debug,
      reuseReset: input.reuseReset,
      noSupervisor: input.noSupervisor,
      workers: input.workers,
      testList: input.testList,
      passthrough: input.passthrough,
      outputPolicy: input.outputPolicy,
      filterOutput: input.filterOutput,
    })
  }

  return planE2eRun({
    hostAdapter: hostAdapter.adapter,
    suite: input.suite,
    file: files,
    headed: input.headed,
    debug: input.debug,
    workers: input.workers,
    testList: input.testList,
    passthrough: input.passthrough,
    outputPolicy: input.outputPolicy,
    filterOutput: input.filterOutput,
  })
}

export function plannedGroupsToCommandConfigs(
  groups: readonly PlannedE2eRunGroup[],
): CommandConfig[] {
  return groups.flatMap((group) =>
    group.runs.map((run) => ({
      command: run.command,
      args: run.args,
      cwd: run.cwd,
      env: normalizeEnv({ ...group.env, ...run.env }),
      runtimeProfile:
        run.runtimeProfile ?? run.envProfile ?? group.runtimeProfile ?? group.envProfile,
    })),
  )
}

export function formatShellCommand(config: CommandConfig): string {
  return [config.command, ...config.args].map(shellQuote).join(' ')
}

export interface CommandExecutionSummary {
  passed: boolean
  exitCode: number
  output: string
}

export async function runCommandConfigs(
  commands: readonly CommandConfig[],
  options: { signal?: AbortSignal; cwd?: string; timeoutMs?: number } = {},
): Promise<CommandExecutionSummary> {
  let combinedOutput = ''

  for (const command of commands) {
    const result = await runCommand(command, options)
    combinedOutput += result.output

    if (result.exitCode !== 0) {
      return {
        passed: false,
        exitCode: result.exitCode,
        output: combinedOutput,
      }
    }
  }

  return {
    passed: true,
    exitCode: 0,
    output: combinedOutput,
  }
}

async function runCommand(
  command: CommandConfig,
  options: { signal?: AbortSignal; cwd?: string; timeoutMs?: number },
): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const cwd = command.cwd ?? options.cwd ?? process.cwd()
    const resolvedEnv = resolveRuntimeEnvironment({
      cwd,
      profile: command.runtimeProfile,
      env: { ...process.env, ...command.env },
    })
    const child = spawn(command.command, command.args, {
      cwd,
      env: buildRuntimeProcessEnv(cwd, { ...process.env, ...command.env }, resolvedEnv),
      detached: process.platform !== 'win32',
    })
    let stdout = ''
    let stderr = ''
    let terminationRequested = false
    let escalationTimer: ReturnType<typeof setTimeout> | undefined

    const requestTermination = (): void => {
      if (terminationRequested) return
      terminationRequested = true
      killProcessTree(child, 'SIGTERM')
      if (process.platform === 'win32') return
      escalationTimer = setTimeout(() => {
        forceKillProcessTree(child)
      }, PROCESS_TREE_FORCE_KILL_GRACE_MS)
    }

    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            requestTermination()
          }, options.timeoutMs)

    const onAbort = (): void => {
      requestTermination()
    }

    if (options.signal) {
      if (options.signal.aborted) queueMicrotask(onAbort)
      else options.signal.addEventListener('abort', onAbort, { once: true })
    }

    const cleanup = (): void => {
      if (timer) clearTimeout(timer)
      if (escalationTimer) clearTimeout(escalationTimer)
      options.signal?.removeEventListener('abort', onAbort)
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      cleanup()
      const message = error.message || String(error)
      resolve({
        exitCode: 1,
        output: [stdout, stderr, message].filter(Boolean).join(''),
      })
    })
    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (terminationRequested && signal !== 'SIGKILL') forceKillProcessTree(child)
      cleanup()
      const exitCode = code ?? exitCodeFromSignal(signal)
      resolve({
        exitCode,
        output: [stdout, stderr].filter(Boolean).join(''),
      })
    })
  })
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:=@+-]+$/u.test(value) ? value : `'${value.replace(/'/gu, "'\\''")}'`
}

function toArray(value: readonly string[] | string | undefined): string[] {
  if (value === undefined) return []
  return typeof value === 'string' ? [value] : [...value]
}

function normalizeEnv(env?: Record<string, string>): Record<string, string> | undefined {
  if (!env || Object.keys(env).length === 0) {
    return undefined
  }

  return env
}
