import { describe, expect, it } from 'vitest'

import { selectRunner } from './select.js'
import type { RunnerTask } from './types.js'

const baseTask: RunnerTask = {
  id: 'task-1',
  description: 'A test task',
  permissions: 'read',
}

const noCodex = (_cmd: string): boolean => false
const hasCodex = (cmd: string): boolean => cmd === 'codex'

describe('selectRunner', () => {
  describe('Path 1: flags.runner = codex-exec', () => {
    it('returns codex-exec when --runner=codex-exec is set, regardless of env', () => {
      const result = selectRunner(baseTask, {
        runner: 'codex-exec',
        env: {},
        which: noCodex,
      })
      expect(result).toStrictEqual('codex-exec')
    })
  })

  describe('Path 2: flags.runner = claude-subagent', () => {
    it('returns claude-subagent when --runner=claude-subagent is set, regardless of env', () => {
      const result = selectRunner(baseTask, {
        runner: 'claude-subagent',
        env: {},
        which: hasCodex,
      })
      expect(result).toStrictEqual('claude-subagent')
    })
  })

  describe('Path 3: CLAUDE_CODE env set, codex not on PATH', () => {
    it('returns claude-subagent when CLAUDE_CODE is set and codex is not on PATH', () => {
      const result = selectRunner(baseTask, {
        env: { CLAUDE_CODE: '1' },
        which: noCodex,
      })
      expect(result).toStrictEqual('claude-subagent')
    })

    it('returns claude-subagent when ANTHROPIC_API_KEY is set and codex is not on PATH', () => {
      const result = selectRunner(baseTask, {
        env: { ANTHROPIC_API_KEY: 'sk-ant-test' },
        which: noCodex,
      })
      expect(result).toStrictEqual('claude-subagent')
    })
  })

  describe('Path 4: no flag, no CLAUDE_CODE, codex IS on PATH', () => {
    it('returns codex-exec when codex is on PATH and no claude env vars are set', () => {
      const result = selectRunner(baseTask, {
        env: {},
        which: hasCodex,
      })
      expect(result).toStrictEqual('codex-exec')
    })
  })

  describe('Path 5: no flag, no CLAUDE_CODE, codex NOT on PATH', () => {
    it('returns local-worktree as the final fallback', () => {
      const result = selectRunner(baseTask, {
        env: {},
        which: noCodex,
      })
      expect(result).toStrictEqual('local-worktree')
    })
  })

  describe('Path 6: selected runner not in task.runners', () => {
    it('throws with a message naming the runner and the allowed list', () => {
      const task: RunnerTask = {
        ...baseTask,
        runners: ['local-worktree'],
      }
      expect(() =>
        selectRunner(task, {
          runner: 'codex-exec',
          env: {},
          which: noCodex,
        }),
      ).toThrow("Runner codex-exec not in task's allowed runners: local-worktree")
    })

    it('throws when env-detected runner is not in task.runners', () => {
      const task: RunnerTask = {
        ...baseTask,
        runners: ['codex-exec'],
      }
      expect(() =>
        selectRunner(task, {
          env: {},
          which: noCodex,
        }),
      ).toThrow("Runner local-worktree not in task's allowed runners: codex-exec")
    })
  })

  describe('task.runners filter — allowed cases', () => {
    it('does not throw when task.runners is undefined', () => {
      expect(() => selectRunner(baseTask, { env: {}, which: noCodex })).not.toThrow()
    })

    it('does not throw when task.runners is empty', () => {
      const task: RunnerTask = { ...baseTask, runners: [] }
      expect(() => selectRunner(task, { env: {}, which: noCodex })).not.toThrow()
    })

    it('does not throw when selected runner is in task.runners', () => {
      const task: RunnerTask = { ...baseTask, runners: ['local-worktree', 'codex-exec'] }
      expect(() => selectRunner(task, { env: {}, which: noCodex })).not.toThrow()
    })
  })
})
