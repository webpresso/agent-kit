import type {
  Checkpoint,
  CheckpointConfig,
  CheckpointId,
  CheckpointResult,
  CheckpointState,
  CheckpointTuple,
  ListCheckpointsOptions,
  ThreadId,
} from './types.js'

export abstract class BaseCheckpointSaver {
  abstract save(
    config: CheckpointConfig,
    state: CheckpointState,
    parentId?: CheckpointId,
  ): Promise<CheckpointResult>

  abstract loadLatest(threadId: ThreadId): Promise<Checkpoint | null>

  abstract load(checkpointId: CheckpointId): Promise<Checkpoint | null>

  abstract list(options?: ListCheckpointsOptions): Promise<Checkpoint[]>

  abstract delete(checkpointId: CheckpointId): Promise<CheckpointResult>

  abstract clearThread(threadId: ThreadId): Promise<CheckpointResult>

  async getTuple(config: CheckpointConfig): Promise<CheckpointTuple | null> {
    const checkpoint = await this.loadLatest(config.threadId)
    if (!checkpoint) return null

    return {
      config,
      checkpoint,
      parentConfig: checkpoint.parentId
        ? { ...config, threadId: checkpoint.parentId as ThreadId }
        : undefined,
    }
  }

  put(
    config: CheckpointConfig,
    checkpoint: Omit<Checkpoint, 'id' | 'createdAt'>,
  ): Promise<CheckpointResult> {
    return this.save(config, checkpoint.state, checkpoint.parentId)
  }
}

export function generateCheckpointId(): CheckpointId {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `ckpt_${timestamp}_${random}`
}

export function generateThreadId(): ThreadId {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `thrd_${timestamp}_${random}`
}
