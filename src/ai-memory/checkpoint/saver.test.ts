import type {
  Checkpoint,
  CheckpointConfig,
  CheckpointId,
  CheckpointResult,
  CheckpointState,
  ListCheckpointsOptions,
  ThreadId,
} from './types.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BaseCheckpointSaver, generateCheckpointId, generateThreadId } from './saver.js'

class TestCheckpointSaver extends BaseCheckpointSaver {
  private checkpoints = new Map<CheckpointId, Checkpoint>()

  async save(
    config: CheckpointConfig,
    state: CheckpointState,
    parentId?: CheckpointId,
  ): Promise<CheckpointResult> {
    const id = generateCheckpointId()
    const checkpoint: Checkpoint = {
      id,
      threadId: config.threadId,
      state,
      parentId,
      createdAt: new Date(),
    }
    this.checkpoints.set(id, checkpoint)
    return { success: true, checkpointId: id }
  }

  async loadLatest(threadId: ThreadId): Promise<Checkpoint | null> {
    const threadCheckpoints = Array.from(this.checkpoints.values())
      .filter((c) => c.threadId === threadId)
      .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    return threadCheckpoints[0] ?? null
  }

  async load(checkpointId: CheckpointId): Promise<Checkpoint | null> {
    return this.checkpoints.get(checkpointId) ?? null
  }

  async list(options?: ListCheckpointsOptions): Promise<Checkpoint[]> {
    let checkpoints = Array.from(this.checkpoints.values())

    if (options?.threadId) {
      checkpoints = checkpoints.filter((c) => c.threadId === options.threadId)
    }

    return checkpoints.toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  async delete(checkpointId: CheckpointId): Promise<CheckpointResult> {
    const existed = this.checkpoints.delete(checkpointId)
    return { success: existed, checkpointId }
  }

  async clearThread(threadId: ThreadId): Promise<CheckpointResult> {
    const toDelete = Array.from(this.checkpoints.entries())
      .filter(([, c]) => c.threadId === threadId)
      .map(([id]) => id)

    for (const id of toDelete) {
      this.checkpoints.delete(id)
    }

    return { success: true }
  }
}

describe('BaseCheckpointSaver', () => {
  let saver: TestCheckpointSaver

  beforeEach(() => {
    saver = new TestCheckpointSaver()
  })

  describe('getTuple', () => {
    it('should return null when no checkpoint exists', async () => {
      const config: CheckpointConfig = {
        threadId: 'thrd_test123',
        userId: 'user_1',
      }

      const result = await saver.getTuple(config)

      expect(result).toBeNull()
    })

    it('should return checkpoint tuple with checkpoint', async () => {
      const threadId = 'thrd_test456' as ThreadId
      const config: CheckpointConfig = { threadId, userId: 'user_1' }
      const state: CheckpointState = {
        messages: [{ role: 'user', content: 'Hello' }],
        toolCalls: [],
      }

      await saver.save(config, state)

      const result = await saver.getTuple(config)

      expect(result).not.toBeNull()
      expect(result?.config).toEqual(config)
      expect(result?.checkpoint.state).toEqual(state)
    })

    it('should include parentConfig when checkpoint has parentId', async () => {
      vi.useFakeTimers()

      const threadId = 'thrd_parent' as ThreadId
      const config: CheckpointConfig = { threadId, userId: 'user_1' }
      const state: CheckpointState = { messages: [], toolCalls: [] }

      const firstResult = await saver.save(config, state)

      await vi.advanceTimersByTimeAsync(10)

      const secondState: CheckpointState = {
        messages: [{ role: 'user', content: 'Follow up' }],
        toolCalls: [],
      }
      await saver.save(config, secondState, firstResult.checkpointId)

      const result = await saver.getTuple(config)

      expect(result).not.toBeNull()
      expect(result?.checkpoint.parentId).toBe(firstResult.checkpointId)
      expect(result?.parentConfig).not.toBe(undefined)

      vi.useRealTimers()
    })

    it('should not include parentConfig when no parentId', async () => {
      const threadId = 'thrd_noparent' as ThreadId
      const config: CheckpointConfig = { threadId, userId: 'user_1' }
      const state: CheckpointState = { messages: [], toolCalls: [] }

      await saver.save(config, state)

      const result = await saver.getTuple(config)

      expect(result?.parentConfig).toBe(undefined)
    })
  })

  describe('put', () => {
    it('should save checkpoint and return result', async () => {
      const config: CheckpointConfig = {
        threadId: 'thrd_put1' as ThreadId,
        userId: 'user_1',
      }
      const checkpoint = {
        threadId: config.threadId,
        state: {
          messages: [{ role: 'assistant' as const, content: 'Hi there' }],
          toolCalls: [],
        },
      }

      const result = await saver.put(config, checkpoint)

      expect(result.success).toBe(true)
      expect(result.checkpointId).not.toBe(undefined)
    })

    it('should preserve state when saving', async () => {
      const config: CheckpointConfig = {
        threadId: 'thrd_put2' as ThreadId,
        userId: 'user_1',
      }
      const state: CheckpointState = {
        messages: [
          { role: 'user', content: 'Question' },
          { role: 'assistant', content: 'Answer' },
        ],
        toolCalls: [{ name: 'read_file', args: { path: '/test.ts' } }],
      }
      const checkpoint = { threadId: config.threadId, state }

      await saver.put(config, checkpoint)
      const loaded = await saver.loadLatest(config.threadId)

      expect(loaded?.state).toEqual(state)
    })

    it('should handle checkpoint with parentId', async () => {
      const config: CheckpointConfig = {
        threadId: 'thrd_put3' as ThreadId,
        userId: 'user_1',
      }
      const parentId = 'ckpt_parent123' as CheckpointId
      const checkpoint = {
        threadId: config.threadId,
        state: { messages: [], toolCalls: [] },
        parentId,
      }

      const result = await saver.put(config, checkpoint)

      expect(result.success).toBe(true)
    })
  })
})

describe('generateCheckpointId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateCheckpointId()
    const id2 = generateCheckpointId()
    const id3 = generateCheckpointId()

    expect(id1).not.toBe(id2)
    expect(id2).not.toBe(id3)
    expect(id1).not.toBe(id3)
  })

  it('should start with ckpt_ prefix', () => {
    const id = generateCheckpointId()

    expect(id.startsWith('ckpt_')).toBe(true)
  })

  it('should contain alphanumeric characters', () => {
    const id = generateCheckpointId()

    expect(id).toMatch(/^ckpt_[a-z0-9]+_[a-z0-9]+$/)
  })

  it('should have consistent format', () => {
    const ids = Array.from({ length: 10 }, () => generateCheckpointId())

    for (const id of ids) {
      expect(id).toMatch(/^ckpt_[a-z0-9]+_[a-z0-9]+$/)
      expect(id.split('_').length).toBe(3)
    }
  })
})

describe('generateThreadId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateThreadId()
    const id2 = generateThreadId()
    const id3 = generateThreadId()

    expect(id1).not.toBe(id2)
    expect(id2).not.toBe(id3)
    expect(id1).not.toBe(id3)
  })

  it('should start with thrd_ prefix', () => {
    const id = generateThreadId()

    expect(id.startsWith('thrd_')).toBe(true)
  })

  it('should contain alphanumeric characters', () => {
    const id = generateThreadId()

    expect(id).toMatch(/^thrd_[a-z0-9]+_[a-z0-9]+$/)
  })

  it('should have consistent format', () => {
    const ids = Array.from({ length: 10 }, () => generateThreadId())

    for (const id of ids) {
      expect(id).toMatch(/^thrd_[a-z0-9]+_[a-z0-9]+$/)
      expect(id.split('_').length).toBe(3)
    }
  })
})
