#!/usr/bin/env bun
import type { ToolInput } from '#hooks/shared/types'

import { existsSync, realpathSync } from 'node:fs'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runHook } from '#hooks/shared/hook-bootstrap'
import { getFilePath } from '#hooks/shared/types'

export const LINTABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css'] as const

export const SKIP_PATTERNS: readonly RegExp[] = [
  /\/node_modules\//,
  /\/dist\//,
  /\/.next\//,
  /\/generated\//,
  /\/worker-configuration\.d\.ts$/,
]

export function isLintableFile(filePath: string): boolean {
  return (LINTABLE_EXTENSIONS as readonly string[]).includes(extname(filePath))
}

export function isSkippedPath(filePath: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(filePath))
}

export function shouldLintFile(input: ToolInput): boolean {
  const filePath = getFilePath(input)
  if (!filePath) return false
  if (!isLintableFile(filePath)) return false
  if (isSkippedPath(filePath)) return false
  return true
}

/**
 * Hot-path compatibility shim.
 *
 * `PostToolUse` fires for every eligible edit/write, so broad shell-outs here
 * add latency on the critical path. Until the deferred execution plane exists,
 * the hook only classifies that a file would have been lint-eligible.
 */
export function lintFile(filePath: string, _projectDir: string): boolean {
  if (!existsSync(filePath)) return false
  return true
}

export function processPostToolUse(input: ToolInput, projectDir: string): boolean {
  if (!shouldLintFile(input)) return false
  const filePath = input.tool_input!.file_path as string
  return lintFile(filePath, projectDir)
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  runHook(
    (input) => {
      const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
      processPostToolUse(input as ToolInput, projectDir)
      return null
    },
    () => '{}',
  )
}
