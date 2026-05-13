#!/usr/bin/env bun
/**
 * SessionStart hook: injects WP_ROUTING_BLOCK and optionally `.agent/routing.md`
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
 * Always emits — never returns null. WP_ROUTING_BLOCK is always prepended.
 * If `.agent/routing.md` exists and is non-empty, it is appended after the block.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { AK_ROUTING_BLOCK } from '#hooks/shared/routing-block'
import { restore } from '#session-memory/session'
import { computeRepoHash } from '#session-memory/repo-hash'

import { readUpdateBanner } from './update-banner.js'
import { isDirectEntrypoint } from '#hooks/shared/direct-entrypoint'

export { WP_ROUTING_BLOCK }
export const MAX_BYTES = 200 * 1024
export const TRUNCATION_NOTICE = '\n\n[truncated: file exceeded 200KB limit]'

type StartInput = Record<string, unknown>
type EnvLike = Record<string, string | undefined>

/**
 * Build the session-knowledge XML block from restored session context.
 *
 * Format:
 *   <session_knowledge>
 *     <entry tool="..." ts="...">...</entry>
 *     ...
 *   </session_knowledge>
 *
 * Injected only when source=compact and restore finds relevant hits.
 */
export function buildSessionKnowledgeBlock(
  hits: ReadonlyArray<{ content: string; source: string; tier: string }>,
  query: string,
): string {
  if (hits.length === 0) return ''
  const entries = hits
    .map(
      (h) =>
        `  <entry source="${h.source.replace(/"/g, '&quot;')}" tier="${h.tier}">${h.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</entry>`,
    )
    .join('\n')
  return `\n\n<session_knowledge query="${query.replace(/"/g, '&quot;')}">\n${entries}\n</session_knowledge>`
}

/**
 * Async function: given a parsed input payload, a working directory, and
 * environment variables, produce the JSON string that the hook should write
 * to stdout. Always emits — never returns null. WP_ROUTING_BLOCK is always
 * prepended; `.agent/routing.md` content is appended when present and non-empty.
 *
 * When source=compact, also restores session context and injects <session_knowledge>.
 */
export async function buildOutput(input: StartInput, cwd: string, env: EnvLike): Promise<string> {
  const projectDir =
    env.CLAUDE_PROJECT_DIR && env.CLAUDE_PROJECT_DIR.length > 0 ? env.CLAUDE_PROJECT_DIR : cwd
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
      process.stderr.write(
        `wp-sessionstart-routing: failed to read ${target}: ${(err as Error).message}\n`,
      )
    }
    // ENOENT / ENOTDIR: no routing.md, that's fine — emit routing block alone.
  }

  let gstackBlock: string | null = null
  if (env.WP_GSTACK_ROUTING === '1') {
    const gstackDir = join(homedir(), '.claude', 'skills', 'gstack')
    if (existsSync(gstackDir)) {
      gstackBlock =
        '\n\n## Interactive skills (gstack)\nSkills like /browse, /qa, /ship, /investigate, /review available. Use /browse for all web browsing.'
    }
  }

  let additionalContext =
    routingMd !== null ? WP_ROUTING_BLOCK + '\n\n' + routingMd : WP_ROUTING_BLOCK
  if (gstackBlock !== null) {
    additionalContext += gstackBlock
  }

  const updateBanner = readUpdateBanner(env as NodeJS.ProcessEnv)
  if (updateBanner !== null) {
    additionalContext += '\n\n' + updateBanner
  }

  // Compact-source restore branch: when Claude Code restarts after compaction,
  // restore relevant session context and inject <session_knowledge> block.
  const source = typeof input.source === 'string' ? input.source : ''
  if (source === 'compact') {
    try {
      const repoHash = computeRepoHash(projectDir)
      // Use last user prompt as query if available, else generic query
      const lastPrompt =
        typeof input.last_user_prompt === 'string' && input.last_user_prompt.trim().length > 0
          ? input.last_user_prompt.trim()
          : 'recent session context'
      const restoreResult = restore({ repoHash, query: lastPrompt, limit: 10 })
      const knowledgeBlock = buildSessionKnowledgeBlock(restoreResult.hits, lastPrompt)
      if (knowledgeBlock.length > 0) {
        additionalContext += knowledgeBlock
      }
    } catch (err) {
      // Non-blocking: log and continue without session knowledge
      process.stderr.write(
        `ak-sessionstart-routing: restore failed (non-fatal): ${(err as Error).message}\n`,
      )
    }
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
    const out = await buildOutput(input, process.cwd(), process.env)
    process.stdout.write(out)
  } catch (err) {
    process.stderr.write(`wp-sessionstart-routing: ${(err as Error).message}\n`)
  }
  process.exit(0)
}

if (isDirectEntrypoint(import.meta.url)) {
  void main()
}
