import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { parseLogLine, type ParsedLogLine } from '#hooks/pretool-guard/logger'

export interface PretoolLogRecord extends ParsedLogLine {
  sourceFile: string
  lineNumber: number
}

export interface PretoolLogReadResult {
  records: PretoolLogRecord[]
  candidateFiles: string[]
  warnings: string[]
}

export interface ReadPretoolEvidenceOptions {
  logFiles?: readonly string[]
  maxFiles?: number
  maxBytesPerFile?: number
}

const DEFAULT_CANDIDATE_FILES = [
  '.agent/logs/pretool-guard.log',
  '.omx/state/hooks/worktree/pretool-guard.log',
  '.omx/hooks/worktree/pretool-guard.log',
] as const

export function readPretoolEvidence(
  rootDirectory: string = process.cwd(),
  options: ReadPretoolEvidenceOptions = {},
): PretoolLogReadResult {
  const root = resolve(rootDirectory)
  const maxFiles = options.maxFiles ?? 24
  const maxBytesPerFile = options.maxBytesPerFile ?? 512_000
  const candidateFiles = collectCandidateFiles(root, options.logFiles, maxFiles)
  const warnings: string[] = []
  const records: PretoolLogRecord[] = []

  for (const candidate of candidateFiles) {
    const absolutePath = resolve(root, candidate)
    let stat
    try {
      stat = statSync(absolutePath)
    } catch {
      continue
    }
    if (!stat.isFile()) continue
    if (stat.size > maxBytesPerFile) {
      warnings.push(`${candidate} skipped: ${stat.size} bytes exceeds ${maxBytesPerFile}`)
      continue
    }

    const lines = readFileSync(absolutePath, 'utf8').split(/\r?\n/u)
    for (const [index, line] of lines.entries()) {
      if (!line.trim()) continue
      const parsed = parseLogLine(line)
      if (!parsed) {
        warnings.push(`${candidate}:${index + 1} ignored: not a pretool log record`)
        continue
      }
      records.push({ ...parsed, sourceFile: candidate, lineNumber: index + 1 })
    }
  }

  return { records, candidateFiles, warnings }
}

function collectCandidateFiles(
  root: string,
  explicitFiles: readonly string[] | undefined,
  maxFiles: number,
): string[] {
  if (explicitFiles && explicitFiles.length > 0) return explicitFiles.map((file) => normalize(root, file))

  const candidates = new Set<string>()
  for (const file of DEFAULT_CANDIDATE_FILES) candidates.add(file)

  const envLogDir = process.env.PRETOOL_LOG_DIR
  if (envLogDir) candidates.add(normalize(root, join(envLogDir, 'pretool-guard.log')))

  for (const rootRelativeDir of ['.omx/state', '.omx/runtime', 'logs']) {
    for (const file of findNamedFiles(resolve(root, rootRelativeDir), 'pretool-guard.log', maxFiles)) {
      candidates.add(normalize(root, file))
      if (candidates.size >= maxFiles) return [...candidates]
    }
  }

  return [...candidates]
}

function findNamedFiles(startDir: string, fileName: string, maxFiles: number): string[] {
  const found: string[] = []
  const stack = [startDir]
  while (stack.length > 0 && found.length < maxFiles) {
    const dir = stack.pop()
    if (!dir || !existsSync(dir)) continue
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue
        stack.push(fullPath)
      } else if (entry.isFile() && entry.name === fileName) {
        found.push(fullPath)
        if (found.length >= maxFiles) break
      }
    }
  }
  return found
}

function normalize(root: string, filePath: string): string {
  const absolute = resolve(root, filePath)
  const rel = relative(root, absolute)
  return rel.startsWith('..') ? absolute : rel
}
