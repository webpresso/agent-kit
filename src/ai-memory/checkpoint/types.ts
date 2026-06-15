import { z } from 'zod'

export type CheckpointId = string

export type ThreadId = string

export interface CheckpointMetadata {
  source: 'auto' | 'user' | 'system'
  step: number
  createdAt: Date
  description?: string
  custom?: Record<string, unknown>
}

export interface SerializedMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCallId?: string
  timestamp?: string
}

export interface SerializedToolCall {
  id?: string
  name: string
  input?: Record<string, unknown>
  args?: Record<string, unknown>
  output?: unknown
  result?: unknown
  status?: 'pending' | 'completed' | 'failed'
  durationMs?: number
}

export interface SerializedCodeBlock {
  toolCallId: string
  code: string
  result?: unknown
  consoleLogs?: readonly string[]
}

export interface CheckpointState {
  messages: SerializedMessage[]
  toolCalls?: SerializedToolCall[]
  codeBlocks?: readonly SerializedCodeBlock[]
  context?: Record<string, unknown>
  tokenUsage?: {
    input: number
    output: number
    total: number
  }
}

export interface Checkpoint {
  id: CheckpointId
  threadId: ThreadId
  parentId?: CheckpointId
  state: CheckpointState
  metadata?: CheckpointMetadata
  createdAt: Date
}

export interface CheckpointConfig {
  threadId: ThreadId
  userId?: string
  saveInterval?: number
  maxCheckpoints?: number
  saveOnEnd?: boolean
}

export interface ListCheckpointsOptions {
  threadId?: ThreadId
  limit?: number
  offset?: number
  orderBy?: 'createdAt' | 'step'
  order?: 'asc' | 'desc'
}

export interface CheckpointResult {
  success: boolean
  checkpointId?: CheckpointId
  error?: string
}

export interface CheckpointTuple {
  config: CheckpointConfig
  checkpoint: Checkpoint
  parentConfig?: CheckpointConfig
}

export const SerializedMessageSchema = z.looseObject({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  toolCallId: z.string().optional(),
  timestamp: z.string().optional(),
})

export const SerializedToolCallSchema = z.looseObject({
  id: z.string().optional(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  output: z.unknown().optional(),
  result: z.unknown().optional(),
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  durationMs: z.number().optional(),
})

export const SerializedCodeBlockSchema = z.looseObject({
  toolCallId: z.string(),
  code: z.string(),
  result: z.unknown().optional(),
  consoleLogs: z.array(z.string()).optional(),
})

export const CheckpointStateSchema = z.looseObject({
  messages: z.array(SerializedMessageSchema),
  toolCalls: z.array(SerializedToolCallSchema).optional(),
  codeBlocks: z.array(SerializedCodeBlockSchema).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  tokenUsage: z
    .looseObject({
      input: z.number(),
      output: z.number(),
      total: z.number(),
    })
    .optional(),
})

export const CheckpointMetadataSchema = z.looseObject({
  source: z.enum(['auto', 'user', 'system']),
  step: z.number(),
  createdAt: z.coerce.date(),
  description: z.string().optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
})
