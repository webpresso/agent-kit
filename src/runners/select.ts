import type { RunnerTask } from '#runners/types'
import { commandExists } from '#runtime/command-exists.js'

export type RunnerId = 'claude-subagent' | 'codex-exec' | 'local-worktree'

export interface SelectRunnerOptions {
  /** From --runner CLI flag */
  runner?: string
  /** Injectable for tests; defaults to process.env */
  env?: Readonly<Record<string, string>>
  /** Injectable: checks if cmd is on PATH. Defaults to a cross-platform PATH scan. */
  which?: (cmd: string) => boolean
}

function detect(env: Readonly<Record<string, string>>, which: (cmd: string) => boolean): RunnerId {
  const isClaudeEnv = env['CLAUDE_CODE'] !== undefined || env['ANTHROPIC_API_KEY'] !== undefined

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
    throw new Error(`Runner ${candidate} not in task's allowed runners: ${runners.join(', ')}`)
  }
}

export function selectRunner(task: RunnerTask, opts?: SelectRunnerOptions): RunnerId {
  const env: Readonly<Record<string, string>> = opts?.env ?? (process.env as Record<string, string>)
  const which = opts?.which ?? commandExists

  let candidate: RunnerId

  if (opts?.runner !== undefined) {
    candidate = opts.runner as RunnerId
  } else {
    candidate = detect(env, which)
  }

  assertAllowed(candidate, task)

  return candidate
}
