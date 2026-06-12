#!/usr/bin/env bun
/**
 * PreCompact hook — triggered before Claude Code compacts the context window.
 *
 * Snapshots the current session events into the session memory store so they
 * can be restored after compaction via SessionStart (source=compact).
 *
 * Non-blocking: always exits 0. If SQLite is locked or snapshot stalls past
 * 5s cap, a partial snapshot is recorded and the hook exits gracefully.
 *
 * Input (stdin): PreCompact JSON payload from Claude Code (currently unused)
 * Output (stdout): `{}` (passthrough — Claude proceeds normally)
 */
import { suppressStderr } from '#hooks/shared/hook-bootstrap'
import { isDirectEntrypoint } from '#hooks/shared/direct-entrypoint'
import { snapshot } from '#session-memory/session'
import { computeRepoHash } from '#session-memory/repo-hash'

const CAP_MS = 5_000

export interface PreCompactResult {
  readonly snapshotId: string
  readonly eventsIncluded: number
  readonly partial: boolean
}

export async function runPreCompact(cwd?: string): Promise<PreCompactResult | null> {
  try {
    const repoHash = computeRepoHash(cwd)
    const result = await snapshot({ repoHash, capMs: CAP_MS })
    process.stderr.write(
      `ak-pre-compact: snapshot ${result.snapshotId} (${result.eventsIncluded} events${result.partial ? ', partial' : ''})\n`,
    )
    return result
  } catch (err: unknown) {
    process.stderr.write(
      `ak-pre-compact: snapshot failed: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return null
  }
}

export async function main(): Promise<void> {
  suppressStderr()

  // Read and discard stdin (required even if unused so Claude Code doesn't stall)
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)

  const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

  await runPreCompact(cwd)

  // Always write passthrough output and exit 0
  process.stdout.write('{}')
  process.exit(0)
}

if (isDirectEntrypoint(import.meta.url)) {
  void main()
}
