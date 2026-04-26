#!/usr/bin/env node
import type { ToolInput } from '#hooks/shared/types'

import { execSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'

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

export function lintFile(filePath: string, projectDir: string): boolean {
  if (!existsSync(filePath)) return false
  try {
    execSync(`just lint --file "${filePath}"`, { cwd: projectDir, stdio: 'ignore' })
  } catch {
    // Non-blocking
  }
  return true
}

export function processPostToolUse(input: ToolInput, projectDir: string): boolean {
  if (!shouldLintFile(input)) return false
  const filePath = input.tool_input!.file_path as string
  return lintFile(filePath, projectDir)
}

async function main(): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  const inputJson = Buffer.concat(chunks).toString('utf-8')

  if (!inputJson.trim()) process.exit(0)

  const input = JSON.parse(inputJson) as ToolInput
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  processPostToolUse(input, projectDir)
  process.exit(0)
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  main()
}
