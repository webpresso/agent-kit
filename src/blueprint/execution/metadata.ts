import type { BlueprintExecutionBackendValue, BlueprintExecutionStatusValue } from '#core/schema'

import matter from 'gray-matter'

import { executionBackendSchema, executionStatusSchema } from '#core/schema'
import { setBlueprintFrontmatterFields } from '#lifecycle/engine'

export interface BlueprintExecutionMetadata {
  backend: BlueprintExecutionBackendValue
  executionId: string
  status: BlueprintExecutionStatusValue
  updatedAt: string
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }

  return undefined
}

export function readBlueprintExecutionMetadata(
  markdown: string,
): BlueprintExecutionMetadata | null {
  const parsed = matter(markdown)
  const backend = executionBackendSchema.safeParse(parsed.data.execution_backend)
  const status = executionStatusSchema.safeParse(parsed.data.execution_status)
  const executionId = normalizeString(parsed.data.execution_id)
  const updatedAt = normalizeString(parsed.data.execution_updated_at)

  if (!backend.success || !status.success || !executionId || !updatedAt) {
    return null
  }

  return {
    backend: backend.data,
    executionId,
    status: status.data,
    updatedAt,
  }
}

export function writeBlueprintExecutionMetadata(
  markdown: string,
  metadata: BlueprintExecutionMetadata,
): string {
  return setBlueprintFrontmatterFields(markdown, {
    execution_backend: metadata.backend,
    execution_id: metadata.executionId,
    execution_status: metadata.status,
    execution_updated_at: metadata.updatedAt,
  })
}

export function clearBlueprintExecutionMetadata(markdown: string): string {
  return setBlueprintFrontmatterFields(markdown, {
    execution_backend: undefined,
    execution_id: undefined,
    execution_status: undefined,
    execution_updated_at: undefined,
  })
}
