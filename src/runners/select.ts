import { spawnSync } from 'node:child_process'

import type { RunnerTask } from '#runners/types'

export type RunnerId = 'claude-subagent' | 'codex-exec' | 'local-worktree'

export interface SelectRunnerOptions {
  /** From --runner CLI flag */
  runner?: string
  /** Injectable for tests; defaults to process.env */
  env?: Readonly<Record<string, string>>
  /** Injectable: checks if cmd is on PATH. Defaults to real `which` via spawnSync. */
  which?: (cmd: string) => boolean
}

function defaultWhich(cmd: string): boolean {
  const result = spawnSync('which', [cmd], { encoding: 'utf8' })
  return result.status === 0
}

function detect(
  env: Readonly<Record<string, string>>,
  which: (cmd: string) => boolean,
): RunnerId {
  const isClaudeEnv =
    env['CLAUDE_CODE'] !== undefined || env['ANTHROPIC_API_KEY'] !== undefined

  if (isClaudeEnv && !which('codex')) {
    return 'claude-subagent'
  }

  if (which('codex')) {
    return 'codex-exec'
  }

  return 'local-worktree'
}

function assertAllowed(candidate: RunnerId, task: RunnerTask): void {
  const { runners } = task
  if (runners === undefined || runners.length === 0) {
    return
  }
  if (!runners.includes(candidate)) {
    throw new Error(
      `Runner ${candidate} not in task's allowed runners: ${runners.join(', ')}`,
    )
  }
}

export function selectRunner(
  task: RunnerTask,
  opts?: SelectRunnerOptions,
): RunnerId {
  const env: Readonly<Record<string, string>> =
    opts?.env ?? (process.env as Record<string, string>)
  const which = opts?.which ?? defaultWhich

  let candidate: RunnerId

  if (opts?.runner !== undefined) {
    candidate = opts.runner as RunnerId
  } else {
    candidate = detect(env, which)
  }

  assertAllowed(candidate, task)

  return candidate
}
