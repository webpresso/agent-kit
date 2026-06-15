import { readFileSync } from 'node:fs'

import type { z } from 'zod'

/**
 * Read repo-owned JSON whose shape is already constrained by the owning caller.
 * Prefer readJsonFileWithSchema for user input, persisted config, and tool payloads.
 */
export function readTrustedJsonFile<T>(path: string): T {
  return readJsonUnknown(path) as T
}

export function readJsonFileWithSchema<T>(path: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(readJsonUnknown(path))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`JSON file ${path} failed schema validation: ${message}`, { cause: error })
  }
}

function readJsonUnknown(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to read JSON file ${path}: ${message}`, { cause: error })
  }
}
