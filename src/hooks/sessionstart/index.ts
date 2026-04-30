#!/usr/bin/env node
/**
 * SessionStart hook: injects AK_ROUTING_BLOCK and optionally `.agent/routing.md`
 * into Claude Code sessions.
 *
 * Wired in `plugin.json` as `SessionStart` with matcher `startup|resume|compact`.
 * The `compact` source is included so the routing block is re-injected after
 * context compaction (F3 from fact-check: block is silently dropped without it).
 * Cannot block (decision-control unsupported for SessionStart) — this is
 * observability + context injection only. Latency budget: <50ms cold.
 *
 * Output contract (per Claude Code hooks docs):
 *   {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"<contents>"}}
 *
 * Always emits — never returns null. AK_ROUTING_BLOCK is always prepended.
 * If `.agent/routing.md` exists and is non-empty, it is appended after the block.
 */
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { AK_ROUTING_BLOCK } from '#hooks/shared/routing-block'

export { AK_ROUTING_BLOCK }
export const MAX_BYTES = 200 * 1024
export const TRUNCATION_NOTICE = '\n\n[truncated: file exceeded 200KB limit]'

type StartInput = Record<string, unknown>
type EnvLike = Record<string, string | undefined>

/**
 * Pure function: given a parsed input payload, a working directory, and
 * environment variables, produce the JSON string that the hook should write
 * to stdout. Always emits — never returns null. AK_ROUTING_BLOCK is always
 * prepended; `.agent/routing.md` content is appended when present and non-empty.
 */
export function buildOutput(_input: StartInput, cwd: string, env: EnvLike): string {
  const projectDir = env.CLAUDE_PROJECT_DIR && env.CLAUDE_PROJECT_DIR.length > 0 ? env.CLAUDE_PROJECT_DIR : cwd
  const target = join(projectDir, '.agent', 'routing.md')

  let routingMd: string | null = null
  try {
    const stat = statSync(target)
    if (stat.isFile() && stat.size > 0) {
      const raw = readFileSync(target, 'utf-8')
      if (raw.length > 0) {
        let content = raw
        if (Buffer.byteLength(raw, 'utf-8') > MAX_BYTES) {
          // Slice on UTF-16 code units; routing.md is ASCII-dominant in practice.
          content = raw.slice(0, MAX_BYTES) + TRUNCATION_NOTICE
        }
        routingMd = content
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT' && code !== 'ENOTDIR') {
      // Permission or other read errors: surface to stderr but continue.
      process.stderr.write(`ak-sessionstart-routing: failed to read ${target}: ${(err as Error).message}\n`)
    }
    // ENOENT / ENOTDIR: no routing.md, that's fine — emit routing block alone.
  }

  const additionalContext =
    routingMd !== null ? AK_ROUTING_BLOCK + '\n\n' + routingMd : AK_ROUTING_BLOCK

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
    process.stdout.write(out)
  } catch (err) {
    process.stderr.write(`ak-sessionstart-routing: ${(err as Error).message}\n`)
  }
  process.exit(0)
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  void main()
}
