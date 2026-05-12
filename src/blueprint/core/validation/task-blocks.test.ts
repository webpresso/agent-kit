/**
 * Tests for task-block schema validation (runners + permissions fields).
 */

import { describe, expect, it } from 'vitest'

import { taskFrontmatterSchema } from './task-blocks.js'

describe('taskFrontmatterSchema', () => {
  describe('runners field', () => {
    it('parses a valid task with runners list', () => {
      const result = taskFrontmatterSchema.parse({
        runners: ['claude-subagent', 'codex-exec'],
      })
      expect(result.runners).toStrictEqual(['claude-subagent', 'codex-exec'])
    })

    it('allows a single runner', () => {
      const result = taskFrontmatterSchema.parse({
        runners: ['local-worktree'],
      })
      expect(result.runners).toStrictEqual(['local-worktree'])
    })

    it('allows all valid runner ids', () => {
      const allRunners = [
        'omx-team',
        'omx-pll-interactive',
        'claude-subagent',
        'codex-exec',
        'local-worktree',
      ] as const
      const result = taskFrontmatterSchema.parse({ runners: [...allRunners] })
      expect(result.runners).toStrictEqual([...allRunners])
    })

    it('fails with a Zod error for unknown runner id', () => {
      const parsed = taskFrontmatterSchema.safeParse({ runners: ['unknown-runner'] })
      expect(parsed.success).toBe(false)
      if (!parsed.success) {
        expect(parsed.error.issues.length).toBeGreaterThan(0)
        const message = parsed.error.issues[0]?.message ?? ''
        expect(message).toBeTruthy()
      }
    })

    it('fails with a Zod error when one runner in the list is invalid', () => {
      const parsed = taskFrontmatterSchema.safeParse({
        runners: ['claude-subagent', 'bad-runner'],
      })
      expect(parsed.success).toBe(false)
    })

    it('defaults runners to undefined when absent', () => {
      const result = taskFrontmatterSchema.parse({})
      expect(result.runners).toBeUndefined()
    })

    it('defaults runners to undefined when empty object is passed', () => {
      const result = taskFrontmatterSchema.parse({ permissions: 'read' })
      expect(result.runners).toBeUndefined()
    })
  })

  describe('permissions field', () => {
    it('defaults to workspace-write when permissions is absent', () => {
      const result = taskFrontmatterSchema.parse({})
      expect(result.permissions).toStrictEqual('workspace-write')
    })

    it('parses permissions: read correctly', () => {
      const result = taskFrontmatterSchema.parse({ permissions: 'read' })
      expect(result.permissions).toStrictEqual('read')
    })

    it('parses permissions: workspace-write correctly', () => {
      const result = taskFrontmatterSchema.parse({ permissions: 'workspace-write' })
      expect(result.permissions).toStrictEqual('workspace-write')
    })

    it('fails with a Zod error for unknown permission value', () => {
      const parsed = taskFrontmatterSchema.safeParse({ permissions: 'admin' })
      expect(parsed.success).toBe(false)
      if (!parsed.success) {
        expect(parsed.error.issues.length).toBeGreaterThan(0)
      }
    })

    it('fails for empty string permission', () => {
      const parsed = taskFrontmatterSchema.safeParse({ permissions: '' })
      expect(parsed.success).toBe(false)
    })
  })

  describe('combined fields', () => {
    it('parses a task with both runners and permissions', () => {
      const result = taskFrontmatterSchema.parse({
        runners: ['claude-subagent', 'codex-exec'],
        permissions: 'read',
      })
      expect(result.runners).toStrictEqual(['claude-subagent', 'codex-exec'])
      expect(result.permissions).toStrictEqual('read')
    })

    it('applies default permissions when only runners is provided', () => {
      const result = taskFrontmatterSchema.parse({
        runners: ['omx-team'],
      })
      expect(result.runners).toStrictEqual(['omx-team'])
      expect(result.permissions).toStrictEqual('workspace-write')
    })
  })
})
