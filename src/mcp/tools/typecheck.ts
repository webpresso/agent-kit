/**
 * `ak_typecheck` MCP tool.
 *
 * Runs `tsc --noEmit` either at cwd (no `packages` given) or once per
 * resolved package path (each becomes `tsc --noEmit -p <pkg>/tsconfig.json`).
 * Captures stdout (which is where `tsc` emits diagnostics) and parses
 * structured `{file, line, code, message}` entries from the standard
 * `<file>(<line>,<col>): error TS<code>: <message>` format. Returns the
 * aggregated payload `{passed, errorCount, errors, output}` wrapped in MCP
 * `text` content blocks.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

import type { ToolDescriptor } from '../auto-discover.js'

const inputSchema = z.object({
  packages: z.array(z.string()).optional(),
})

export type AkTypecheckInput = z.infer<typeof inputSchema>

export interface TscError {
  readonly file: string
  readonly line: number
  readonly code: string
  readonly message: string
}

interface RunResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

// Matches both standard tsc formats:
//   src/foo.ts(5,12): error TS2304: Cannot find name 'bar'.
//   src/foo.ts:5:12 - error TS2304: Cannot find name 'bar'.
const ERROR_LINE = /^(.+?)(?:\((\d+),\d+\)|:(\d+):\d+)(?::\s*|\s+-\s+)error TS(\d+):\s*(.*)$/

function parseTscOutput(raw: string): TscError[] {
  const errors: TscError[] = []
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const match = ERROR_LINE.exec(line)
    if (!match) continue
    const [, file, paren, colon, code, message] = match
    const lineNumber = paren ?? colon ?? '0'
    errors.push({
      file: file ?? '',
      line: Number(lineNumber),
      code: code ?? '',
      message: (message ?? '').trim(),
    })
  }
  return errors
}

/**
 * Read package globs from a `pnpm-workspace.yaml` if present at `cwd`. Used
 * only as a presence signal at the moment — the simple package-name → relative
 * dir mapping below treats the input strings as paths, which works for both
 * pnpm workspace globs (e.g. `packages/foo`) and simple subdir names. Kept as
 * its own function so future task work can expand it into proper glob
 * resolution without touching the handler.
 */
function readWorkspaceGlobs(cwd: string): string[] | null {
  const file = join(cwd, 'pnpm-workspace.yaml')
  if (!existsSync(file)) return null
  const text = readFileSync(file, 'utf8')
  const globs: string[] = []
  for (const line of text.split('\n')) {
    const m = /^\s*-\s*['"]?([^'"\s#]+)['"]?\s*$/.exec(line)
    if (m && m[1]) globs.push(m[1])
  }
  return globs
}

function runCommand(cmd: string, args: readonly string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...args])
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (err) => reject(err))
    child.on('close', (code: number | null) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 })
    })
  })
}

const tool: ToolDescriptor = {
  name: 'ak_typecheck',
  description:
    'Run `tsc --noEmit` per resolved package (or at cwd) and return structured diagnostics parsed from tsc stdout.',
  inputSchema,
  handler: async (raw): Promise<{ content: { type: string; text: string }[] }> => {
    const input = inputSchema.parse(raw ?? {})
    const cwd = process.cwd()

    const targets: string[] | null =
      input.packages && input.packages.length > 0 ? input.packages : null

    // Touch the workspace file so its presence is observable in tests/log; the
    // current resolution treats each entry as a relative path either way.
    if (targets) readWorkspaceGlobs(cwd)

    const runs: RunResult[] = []
    if (targets) {
      for (const pkg of targets) {
        const tsconfig = join(pkg, 'tsconfig.json')
        runs.push(await runCommand('tsc', ['--noEmit', '-p', tsconfig]))
      }
    } else {
      runs.push(await runCommand('tsc', ['--noEmit']))
    }

    const combinedStdout = runs.map((r) => r.stdout).join('')
    const combinedStderr = runs.map((r) => r.stderr).join('')
    const errors = parseTscOutput(combinedStdout)
    const passed = runs.every((r) => r.exitCode === 0)

    const payload = {
      passed,
      errorCount: errors.length,
      errors,
      output: [combinedStdout, combinedStderr].filter(Boolean).join(''),
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(payload) }],
    }
  },
}

export default tool
