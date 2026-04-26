#!/usr/bin/env node
/**
 * SessionStart hook: injects `.agent/routing.md` into Claude Code sessions.
 *
 * Wired in `plugin.json` as `SessionStart` with matcher `startup|resume`.
 * Cannot block (decision-control unsupported for SessionStart) — this is
 * observability + context injection only. Latency budget: <50ms cold.
 *
 * Output contract (per Claude Code hooks docs):
 *   {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"<contents>"}}
 */
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const MAX_BYTES = 200 * 1024
export const TRUNCATION_NOTICE = '\n\n[truncated: file exceeded 200KB limit]'

type StartInput = Record<string, unknown>
type EnvLike = Record<string, string | undefined>

/**
 * Pure function: given a parsed input payload, a working directory, and
 * environment variables, produce the JSON string that the hook should write
 * to stdout — or `null` to indicate "exit silently with no output".
 */
export function buildOutput(_input: StartInput, cwd: string, env: EnvLike): string | null {
  const projectDir = env.CLAUDE_PROJECT_DIR && env.CLAUDE_PROJECT_DIR.length > 0 ? env.CLAUDE_PROJECT_DIR : cwd
  const target = join(projectDir, '.agent', 'routing.md')

  let raw: string
  try {
    const stat = statSync(target)
    if (!stat.isFile() || stat.size === 0) return null
    raw = readFileSync(target, 'utf-8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    // Permission or other read errors: surface to stderr but exit 0.
    process.stderr.write(`ak-sessionstart-routing: failed to read ${target}: ${(err as Error).message}\n`)
    return null
  }

  if (raw.length === 0) return null

  let additionalContext = raw
  if (Buffer.byteLength(raw, 'utf-8') > MAX_BYTES) {
    // Slice on UTF-16 code units; routing.md is ASCII-dominant in practice.
    additionalContext = raw.slice(0, MAX_BYTES) + TRUNCATION_NOTICE
  }

  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext,
    },
  })
}

async function readStdin(): Promise<StartInput> {
  if (process.stdin.isTTY) return {}
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      const text = Buffer.concat(chunks).toString('utf-8').trim()
      if (text.length === 0) return resolve({})
      try {
        resolve(JSON.parse(text) as StartInput)
      } catch {
        resolve({})
      }
    }
    process.stdin.on('data', (c: Buffer) => chunks.push(c))
    process.stdin.on('end', finish)
    process.stdin.on('error', finish)
  })
}

export async function main(): Promise<void> {
  try {
    const input = await readStdin()
    const out = buildOutput(input, process.cwd(), process.env)
    if (out !== null) process.stdout.write(out)
  } catch (err) {
    process.stderr.write(`ak-sessionstart-routing: ${(err as Error).message}\n`)
  }
  process.exit(0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main()
}
