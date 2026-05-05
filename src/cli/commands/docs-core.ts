/**
 * Pure core for `ak docs lint` — no process.exit, no console.log.
 *
 * Reads markdown files, detects `doc-type: blueprint` frontmatter, runs
 * `validateBlueprintPlan`, and returns a structured result. All I/O is
 * injected for testability.
 */

import type { ValidationError } from '#docs-linter/types'

import matter from 'gray-matter'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { validateBlueprintPlan } from '#docs-linter/blueprint-plan'

export interface DocsLintResult {
  files: number
  violations: Array<{ file: string; message: string; rule: string }>
  exitCode: 0 | 1
}

type ReadFileFn = (p: string) => Promise<string>
type GlobFn = (pattern: string, options: { cwd: string }) => Promise<string[]>

function isMarkdownFile(filePath: string): boolean {
  return filePath.endsWith('.md') || filePath.endsWith('.mdx')
}

function walkMarkdownFiles(root: string): string[] {
  const out: string[] = []
  const stat = statSync(root)
  if (stat.isFile()) {
    if (isMarkdownFile(root)) out.push(root)
    return out
  }
  if (!stat.isDirectory()) return out

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const child = path.join(root, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkMarkdownFiles(child))
    } else if (entry.isFile() && isMarkdownFile(child)) {
      out.push(child)
    }
  }
  return out
}

function detectDocType(content: string): string {
  try {
    const parsed = matter(content)
    const data = parsed.data as { 'doc-type'?: string; docType?: string; type?: string }
    return data['doc-type'] ?? data.docType ?? data.type ?? ''
  } catch {
    return ''
  }
}

export async function runDocsLint(
  target: string,
  deps: {
    readFile?: ReadFileFn
    glob?: GlobFn
  } = {},
): Promise<DocsLintResult> {
  const absoluteTarget = path.resolve(process.cwd(), target)

  let files: string[]

  if (deps.glob) {
    const matches = await deps.glob('**/*.{md,mdx}', { cwd: absoluteTarget })
    files = matches.map((f) => path.join(absoluteTarget, f))
  } else {
    files = walkMarkdownFiles(absoluteTarget)
  }

  if (!files.length) {
    return { files: 0, violations: [], exitCode: 0 }
  }

  const defaultReadFile: ReadFileFn = async (p) => readFileSync(p, 'utf-8')
  const read = deps.readFile ?? defaultReadFile

  const allErrors: ValidationError[] = []
  let blueprintFiles = 0

  for (const file of files) {
    const raw = await read(file)
    const docType = detectDocType(raw)
    if (docType !== 'blueprint') continue
    blueprintFiles++
    allErrors.push(...validateBlueprintPlan(file, raw, docType))
  }

  if (!blueprintFiles) {
    return { files: files.length, violations: [], exitCode: 0 }
  }

  const errorCount = allErrors.filter((e) => e.severity === 'error').length

  const violations = allErrors.map((e) => ({
    file: e.file,
    message: e.message,
    rule: e.ruleId ?? '',
  }))

  return {
    files: blueprintFiles,
    violations,
    exitCode: errorCount > 0 ? 1 : 0,
  }
}
