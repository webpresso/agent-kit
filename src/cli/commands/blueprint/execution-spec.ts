/**
 * execution-spec.ts — pure spec-building / env-composition logic.
 *
 * Zero I/O. All functions take inputs and return structured objects.
 * Tested by execution-spec.test.ts.
 */

import type {
  BlueprintExecutionArtifacts,
  BlueprintExecutionBackend,
  BlueprintLaunchSpec,
  BlueprintTaskLaunchSpec,
  RuntimeStateStatus,
} from '#index'
import type { Blueprint } from '#local'

import path from 'node:path'

import {
  blueprintLaunchSpecSchema,
  DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
  resolveBlueprintProgressBridgePath,
  runtimeSnapshotPathForExecution,
} from '#index'

// ---------------------------------------------------------------------------
// Re-exported types (kept here so consumers can import from one place)
// ---------------------------------------------------------------------------

export interface BuildBlueprintLaunchSpecInput {
  blueprint: Blueprint
  blueprintPath: string
  blueprintSlug: string
}

export interface BlueprintExecutionRuntimePaths {
  artifactPaths: string[]
  bridgePath: string
  logPath?: string
  runtimeSnapshotPath: string
  teamStateRoot: string
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

export function nowIsoTimestamp(): string {
  return new Date().toISOString()
}

export function toProjectRelativePath(projectRoot: string, targetPath: string): string {
  return path.relative(projectRoot, targetPath).replace(/\\/g, '/')
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))]
}

export function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code === 'ENOENT'
  )
}

export function buildListTasksVerificationCommand(executionId: string): string {
  return `omx team api list-tasks --input '${JSON.stringify({ team_name: executionId })}' --json`
}

// ---------------------------------------------------------------------------
// Path resolution (pure — no I/O)
// ---------------------------------------------------------------------------

export function resolveRuntimeSnapshotRelativePath(
  executionId: string,
  runtimeStateRoot: string = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
): string {
  return runtimeSnapshotPathForExecution(executionId, runtimeStateRoot)
}

export function resolveTeamStateRelativePath(
  executionId: string,
  runtimeStateRoot: string = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
): string {
  return `${runtimeStateRoot.replace(/\/+$/u, '')}/team/${executionId}`
}

export function resolveBridgeRelativePath(
  backend: BlueprintExecutionBackend,
  executionId: string,
  runtimeStateRoot: string = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
): string {
  return resolveBlueprintProgressBridgePath(runtimeStateRoot, backend, executionId)
}

export function resolveBridgeAbsolutePath(
  projectRoot: string,
  backend: BlueprintExecutionBackend,
  executionId: string,
  runtimeStateRoot: string = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
): string {
  return path.join(projectRoot, resolveBridgeRelativePath(backend, executionId, runtimeStateRoot))
}

export function resolveRuntimeSnapshotAbsolutePath(
  projectRoot: string,
  executionId: string,
  runtimeStateRoot: string = DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
): string {
  return path.join(projectRoot, resolveRuntimeSnapshotRelativePath(executionId, runtimeStateRoot))
}

// ---------------------------------------------------------------------------
// Spec builders
// ---------------------------------------------------------------------------

function toTaskLaunchSpec(task: Blueprint['tasks'][number]): BlueprintTaskLaunchSpec {
  return {
    backendHints: {
      longRunning: task.stepType === 'implement' || task.stepType === 'research',
      testHeavy: task.stepType === 'test-fix' || task.stepType === 'verify',
    },
    dependsOn: task.depends ?? [],
    files: task.targetFile ? [task.targetFile] : [],
    id: task.id,
    title: task.title,
    verificationCommands: [],
  }
}

function countReadyTasks(tasks: BlueprintTaskLaunchSpec[]): number {
  return tasks.filter((task) => task.dependsOn.length === 0).length
}

export function buildBlueprintLaunchSpec(
  input: BuildBlueprintLaunchSpecInput,
): BlueprintLaunchSpec {
  const tasks = input.blueprint.tasks.map(toTaskLaunchSpec)
  const suggestedParallelism = Math.max(1, Math.min(3, countReadyTasks(tasks)))

  return blueprintLaunchSpecSchema.parse({
    backend: 'omx-team',
    blueprintPath: input.blueprintPath,
    blueprintSlug: input.blueprintSlug,
    mode: 'durable',
    policy: {
      maxParallelism: suggestedParallelism,
      runtimeStateRoot: DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
    },
    tasks,
  })
}

function buildTeamPrompt(spec: BlueprintLaunchSpec): string {
  const taskLines = spec.tasks.map((task) => {
    const details = [
      task.dependsOn.length > 0 ? `depends on ${task.dependsOn.join(', ')}` : null,
      task.files.length > 0 ? `files ${task.files.join(', ')}` : null,
      task.verificationCommands.length > 0
        ? `verify with ${task.verificationCommands.join(' && ')}`
        : null,
    ]
      .filter(Boolean)
      .join('; ')

    return `- Task ${task.id}: ${task.title}${details ? ` (${details})` : ''}`
  })

  return [
    `Execute blueprint ${spec.blueprintSlug}.`,
    `Blueprint path: ${spec.blueprintPath}.`,
    'Treat the blueprint as the source of truth.',
    'Use the OMX team task queue below as the execution substrate.',
    ...taskLines,
    'Verify changed work before reporting completion.',
  ].join('\n')
}

export function buildBlueprintExecutionLaunchCommand(spec: BlueprintLaunchSpec): {
  args: string[]
  command: string
  workerCount: number
} {
  const workerCount = spec.policy.maxParallelism ?? 1
  return {
    args: ['team', `${workerCount}:executor`, buildTeamPrompt(spec)],
    command: 'omx',
    workerCount,
  }
}

export function parseTeamExecutionId(output: string): string {
  const match = output.match(/Team started:\s*([^\n]+)/i)
  if (!match?.[1]) {
    throw new Error('Could not determine OMX team identity from launch output.')
  }
  return match[1].trim()
}

export function buildBlueprintExecutionControlCommand(
  backend: BlueprintExecutionBackend,
  action: 'status' | 'resume' | 'stop',
  executionId: string,
): {
  args: string[]
  command: string
} {
  // Only 'omx-team' maps to the `omx team` CLI surface (status / resume / shutdown).
  // The Runner backends ('omx-pll-interactive', 'claude-subagent', 'codex-exec',
  // 'local-worktree') do not use the OMX CLI and have no equivalent control command
  // at this layer — callers must dispatch them through their own runner-specific
  // control path. Throwing here is intentional and correct for all non-omx-team values.
  if (backend !== 'omx-team') {
    throw new Error(`Unsupported execution backend for control command: ${backend}`)
  }

  const subcommand = action === 'stop' ? 'shutdown' : action
  return {
    args: ['team', subcommand, executionId],
    command: 'omx',
  }
}

export function parseOmxTeamApiResponse<T>(output: string, operation: string): T {
  let parsed: {
    data?: T
    error?: {
      code?: string
      message?: string
    }
    ok?: boolean
  }

  try {
    parsed = JSON.parse(output) as typeof parsed
  } catch (error) {
    throw new Error(
      `Failed to parse OMX team api ${operation} response: ${
        error instanceof Error ? error.message : String(error)
      }`,
      {
        cause: error,
      },
    )
  }

  if (!parsed.ok) {
    throw new Error(
      parsed.error?.message ||
        `OMX team api ${operation} failed${parsed.error?.code ? ` (${parsed.error.code})` : ''}.`,
    )
  }

  if (!parsed.data) {
    throw new Error(`OMX team api ${operation} returned no data.`)
  }

  return parsed.data
}

export function buildBlueprintExecutionRuntimePaths(
  backend: BlueprintExecutionBackend,
  executionId: string,
  artifacts: BlueprintExecutionArtifacts | null,
): BlueprintExecutionRuntimePaths {
  const bridgePath = resolveBridgeRelativePath(backend, executionId)
  const runtimeSnapshotPath = resolveRuntimeSnapshotRelativePath(executionId)
  const teamStateRoot = resolveTeamStateRelativePath(executionId)
  return {
    artifactPaths: uniqueStrings([
      runtimeSnapshotPath,
      bridgePath,
      teamStateRoot,
      ...(artifacts?.artifacts ?? []),
    ]),
    bridgePath,
    logPath: artifacts?.logPath,
    runtimeSnapshotPath,
    teamStateRoot,
  }
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export function resolveControlStatus(action: 'status' | 'resume' | 'stop'): RuntimeStateStatus {
  return action === 'stop' ? 'stopped' : 'running'
}
