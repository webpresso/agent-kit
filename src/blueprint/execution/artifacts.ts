import matter from 'gray-matter'

import { setBlueprintFrontmatterFields } from '#lifecycle/engine'

export interface BlueprintExecutionArtifacts {
  artifacts: string[]
  logPath?: string
  verifications: string[]
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => normalizeString(entry))
    .filter((entry): entry is string => entry !== undefined)
}

export function readBlueprintExecutionArtifacts(
  markdown: string,
): BlueprintExecutionArtifacts | null {
  const parsed = matter(markdown)
  const artifacts = normalizeStringArray(parsed.data.execution_artifacts)
  const verifications = normalizeStringArray(parsed.data.execution_verifications)
  const logPath = normalizeString(parsed.data.execution_log_path)

  if (artifacts.length === 0 && verifications.length === 0 && !logPath) {
    return null
  }

  return {
    artifacts,
    logPath,
    verifications,
  }
}

export function writeBlueprintExecutionArtifacts(
  markdown: string,
  artifacts: BlueprintExecutionArtifacts,
): string {
  return setBlueprintFrontmatterFields(markdown, {
    execution_artifacts: artifacts.artifacts,
    execution_log_path: artifacts.logPath,
    execution_verifications: artifacts.verifications,
  })
}

export function clearBlueprintExecutionArtifacts(markdown: string): string {
  return setBlueprintFrontmatterFields(markdown, {
    execution_artifacts: undefined,
    execution_log_path: undefined,
    execution_verifications: undefined,
  })
}
