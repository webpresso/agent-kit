#!/usr/bin/env node
import { globSync } from 'glob'
import { execSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runHook } from '#hooks/shared/hook-bootstrap'
import { isLintableFile, isSkippedPath } from '#hooks/post-tool/lint-after-edit'

const TYPECHECKABLE_EXTENSIONS = new Set(['.ts', '.tsx'])

export function getChangedFiles(projectDir: string): string[] {
  const unstaged = execSync('git diff --name-only', { cwd: projectDir, encoding: 'utf-8' }).trim()
  const staged = execSync('git diff --cached --name-only', { cwd: projectDir, encoding: 'utf-8' }).trim()
  const all = new Set<string>()
  for (const line of unstaged.split('\n')) if (line) all.add(line)
  for (const line of staged.split('\n')) if (line) all.add(line)
  return [...all]
}

export function filterQaFiles(files: string[]): string[] {
  return files.filter((f) => isLintableFile(f) && !isSkippedPath(f))
}

export function getTypecheckFiles(files: string[]): string[] {
  return files.filter((f) => TYPECHECKABLE_EXTENSIONS.has(extname(f)))
}

export function findTestFiles(sourceFile: string, projectDir: string): string[] {
  const ext = extname(sourceFile)
  const base = basename(sourceFile, ext)
  const dir = dirname(sourceFile)
  if (base.endsWith('.test') || base.endsWith('.integration.test')) return [sourceFile]
  const pattern = join(dir, `${base}.{test,integration.test}{.ts,.tsx}`)
  return globSync(pattern, { cwd: projectDir })
}

export function discoverTestFiles(changedFiles: string[], projectDir: string): string[] {
  const testFiles = new Set<string>()
  for (const file of changedFiles) {
    for (const testFile of findTestFiles(file, projectDir)) testFiles.add(testFile)
  }
  return [...testFiles]
}

export function buildTypecheckCommand(files: string[]): string | null {
  if (files.length === 0) return null
  return `just typecheck ${files.map((f) => `--file '${f}'`).join(' ')}`
}

export function buildTestCommand(files: string[]): string | null {
  if (files.length === 0) return null
  return `just test ${files.map((f) => `--file '${f}'`).join(' ')}`
}

function runCommand(cmd: string, projectDir: string): { success: boolean; stderr: string } {
  try {
    execSync(cmd, { cwd: projectDir, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' })
    return { success: true, stderr: '' }
  } catch (error: unknown) {
    return { success: false, stderr: (error as { stderr?: string }).stderr || String(error) }
  }
}

function runStep(label: string, cmd: string | null, projectDir: string): string | null {
  if (!cmd) return null
  const result = runCommand(cmd, projectDir)
  return result.success ? null : `${label} failed:\n${result.stderr}`
}

export function runQaChecks(qaFiles: string[], projectDir: string): string[] {
  const typecheckCmd = buildTypecheckCommand(getTypecheckFiles(qaFiles))
  const testCmd = buildTestCommand(discoverTestFiles(qaFiles, projectDir))
  const errors: string[] = []
  const typecheckErr = runStep('Typecheck', typecheckCmd, projectDir)
  if (typecheckErr) errors.push(typecheckErr)
  const testErr = runStep('Tests', testCmd, projectDir)
  if (testErr) errors.push(testErr)
  return errors
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  runHook(
    (_input) => {
      const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
      const qaFiles = filterQaFiles(getChangedFiles(projectDir))
      if (qaFiles.length === 0) return null
      const errors = runQaChecks(qaFiles, projectDir)
      if (errors.length === 0) return null
      const summary = errors.map((e) => e.split('\n')[0]).join('; ')
      return { systemMessage: `QA gate failed on changed files: ${summary}` }
    },
    (result) => JSON.stringify({ hookSpecificOutput: result }),
  )
}
