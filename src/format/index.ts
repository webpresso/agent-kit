/**
 * Stable subpath export: `webpresso/format`.
 *
 * Wraps the `oxfmt` binary for repo formatting. Mirrors the `runLint` API
 * shape so consumers can compose lint + format in the same pipeline. Unlike
 * `runLint` there is NO fallback — `oxfmt` must be on PATH; if missing we
 * surface a clear error naming the missing binary and the install command.
 */

import { isMissingBinary, isRunFailure, runCommand } from '#mcp/tools/_shared/run-command'
import { resolveProjectRoot } from '#mcp/tools/_shared/project-root'
import { getManagedRunner } from '#tool-runtime'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { extname, resolve, relative } from 'node:path'
import { remark } from 'remark'
import remarkFrontmatter from 'remark-frontmatter'

export interface FormatResult {
  readonly passed: boolean
  readonly exitCode: number
  readonly output: string
  readonly fixedFiles?: readonly string[]
  readonly spawnError?: string
  readonly timedOut?: boolean
  readonly aborted?: boolean
}

export interface RunFormatOptions {
  /** Files or glob targets. When omitted, oxfmt's default discovery runs. */
  readonly files?: readonly string[]
  /** When true, only check (exit 1 on unformatted). When false/undefined, write fixes. */
  readonly check?: boolean
  /** Override the resolved project root. */
  readonly cwd?: string
  /** Hard cap on the spawned process. Defaults to 5 minutes. */
  readonly timeoutMs?: number
  /** Optional cancellation signal propagated to the child process. */
  readonly signal?: AbortSignal
}

const DEFAULT_FORMAT_TIMEOUT_MS = 5 * 60 * 1_000
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx'])
const WALK_IGNORED_DIRS = new Set(['node_modules', 'dist', '.git'])

const REMARK_FORMAT_SETTINGS = {
  bullet: '-' as const,
  emphasis: '*' as const,
  strong: '*' as const,
  fences: true,
  listItemIndent: 'one' as const,
  rule: '-' as const,
  ruleSpaces: false,
}

/**
 * Run formatter and return a structured result. Throws a clear error when
 * `oxfmt` is not on PATH (no silent fallback).
 */
export async function runFormat(options: RunFormatOptions = {}): Promise<FormatResult> {
  const cwd = resolveProjectRoot(options.cwd ? { explicitCwd: options.cwd } : {})
  const expandedTargets = options.files ? await expandFormatTargets(cwd, options.files) : undefined
  const markdownFiles = expandedTargets?.markdownFiles ?? []
  const codeFiles = expandedTargets?.codeFiles ?? options.files
  const runOptions = {
    timeoutMs: options.timeoutMs ?? DEFAULT_FORMAT_TIMEOUT_MS,
    signal: options.signal,
    cwd,
  }

  const codeResult = codeFiles?.length === 0 ? null : await runCodeFormatter(codeFiles, options.check, runOptions)
  if (codeResult && codeResult.spawnError) return codeResult

  const markdownResult = await runMarkdownFormatter({ cwd, files: markdownFiles, check: options.check })
  const output = [codeResult?.output, markdownResult.output].filter(Boolean).join('')
  const passed = Boolean((codeResult?.passed ?? true) && markdownResult.passed)
  const exitCode = passed ? 0 : Math.max(codeResult?.exitCode ?? 0, markdownResult.exitCode)

  return {
    passed,
    exitCode,
    output,
    fixedFiles: options.check
      ? undefined
      : [...(codeResult?.fixedFiles ?? []), ...(markdownResult.fixedFiles ?? [])],
    timedOut: codeResult?.timedOut || undefined,
    aborted: codeResult?.aborted || undefined,
  }
}

async function runCodeFormatter(
  files: readonly string[] | undefined,
  check: boolean | undefined,
  runOptions: { timeoutMs: number; signal?: AbortSignal; cwd: string },
): Promise<FormatResult> {
  const args: string[] = []
  if (check) args.push('--check')
  else args.push('--write')
  // Explicit --ignore-path so oxfmt does not auto-pick `.prettierignore`.
  // Repos often ship `.prettierignore` with `*` to disable IDE Prettier
  // extensions (which would fight oxfmt). Without this flag oxfmt sees the
  // catchall and skips everything. Honor only `.gitignore` plus the patterns
  // declared in `.oxfmtrc.json#ignorePatterns`.
  args.push('--ignore-path', '.gitignore')
  if (files && files.length > 0) args.push(...files)

  const resolution = getManagedRunner('oxfmt', { outputPolicy: 'structured' })
  const outcome = await runCommand(resolution.command, [...resolution.args, ...args], runOptions)

  if (isRunFailure(outcome)) {
    if (isMissingBinary(outcome)) {
      throw new Error(
        "oxfmt binary not found on PATH. Install it as a devDependency: 'vp install -D oxfmt'",
      )
    }
    return {
      passed: false,
      exitCode: 1,
      output: '',
      spawnError: `oxfmt spawn failed: ${outcome.error.code ?? 'unknown'} ${outcome.error.message}`,
    }
  }

  return {
    passed: outcome.exitCode === 0,
    exitCode: outcome.exitCode,
    output: [outcome.stdout, outcome.stderr].filter(Boolean).join(''),
    fixedFiles: check ? undefined : parseFixedFiles(outcome.stdout),
    timedOut: outcome.timedOut || undefined,
    aborted: outcome.aborted || undefined,
  }
}

async function runMarkdownFormatter(input: {
  cwd: string
  files: readonly string[]
  check: boolean | undefined
}): Promise<FormatResult> {
  const dirtyFiles: string[] = []
  const fixedFiles: string[] = []

  for (const file of input.files) {
    const raw = await readFile(file, 'utf8')
    const formatted = await formatMarkdown(raw)
    if (formatted === raw) continue
    const rel = relative(input.cwd, file) || file
    dirtyFiles.push(rel)
    if (!input.check) {
      await writeFile(file, formatted)
      fixedFiles.push(rel)
    }
  }

  if (dirtyFiles.length === 0) {
    return { passed: true, exitCode: 0, output: '', fixedFiles: [] }
  }

  const lines = input.check
    ? dirtyFiles.map((file) => `${file} needs markdown formatting`)
    : fixedFiles.map((file) => `${file} markdown formatted`)

  return {
    passed: !input.check,
    exitCode: input.check ? 1 : 0,
    output: `${lines.join('\n')}\n`,
    fixedFiles,
  }
}

async function formatMarkdown(content: string): Promise<string> {
  return String(
    await remark().use(remarkFrontmatter, ['yaml']).data('settings', REMARK_FORMAT_SETTINGS).process(content),
  )
}

async function expandFormatTargets(
  cwd: string,
  files: readonly string[],
): Promise<{ markdownFiles: string[]; codeFiles: string[] }> {
  const markdownFiles = new Set<string>()
  const codeFiles = new Set<string>()

  for (const file of files) {
    const absolute = resolve(cwd, file)
    const expansion = await expandTarget(absolute)
    if (expansion === null) {
      codeFiles.add(file)
      continue
    }
    for (const markdownFile of expansion.markdownFiles) markdownFiles.add(markdownFile)
    for (const codeFile of expansion.codeFiles) codeFiles.add(relative(cwd, codeFile) || codeFile)
  }

  return {
    markdownFiles: [...markdownFiles].sort(),
    codeFiles: [...codeFiles].sort(),
  }
}

async function expandTarget(
  absoluteTarget: string,
): Promise<{ markdownFiles: string[]; codeFiles: string[] } | null> {
  let targetStat
  try {
    targetStat = await stat(absoluteTarget)
  } catch {
    return null
  }

  if (targetStat.isDirectory()) {
    return walkFormatDirectory(absoluteTarget)
  }

  if (targetStat.isFile()) {
    return isMarkdownPath(absoluteTarget)
      ? { markdownFiles: [absoluteTarget], codeFiles: [] }
      : { markdownFiles: [], codeFiles: [absoluteTarget] }
  }

  return { markdownFiles: [], codeFiles: [] }
}

async function walkFormatDirectory(
  directory: string,
): Promise<{ markdownFiles: string[]; codeFiles: string[] }> {
  const markdownFiles: string[] = []
  const codeFiles: string[] = []
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (WALK_IGNORED_DIRS.has(entry.name)) continue
      const nested = await walkFormatDirectory(resolve(directory, entry.name))
      markdownFiles.push(...nested.markdownFiles)
      codeFiles.push(...nested.codeFiles)
      continue
    }

    if (!entry.isFile()) continue
    const absolute = resolve(directory, entry.name)
    if (isMarkdownPath(absolute)) markdownFiles.push(absolute)
    else codeFiles.push(absolute)
  }

  return { markdownFiles, codeFiles }
}

function isMarkdownPath(file: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extname(file).toLowerCase())
}

/**
 * Best-effort extraction of files oxfmt rewrote. oxfmt does not currently emit
 * a structured list, so this returns an empty array unless a future version
 * adds machine-readable output. Kept as an opt-in field so downstream callers
 * can opt into richer reporting later without an API break.
 */
function parseFixedFiles(_stdout: string): readonly string[] {
  return []
}
