/**
 * Shared types + I/O for `<consumer>/.webpresso/agent-kit-dev-link.json`.
 *
 * Single source of truth for the dev-link state file format used by:
 *   - `scripts/link-edge-local.ts` — writes the file when `--consumer` is passed
 *   - `src/hooks/check-dev-link/index.ts` — SessionStart hook reads it
 *   - `src/dev/restore-dev-links/index.ts` — postinstall bin reads it
 *
 * The file is gitignored on the consumer side (per-developer dev opt-in);
 * its absence means CI / no-dev-link path → all readers no-op silently.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const STATE_FILE_RELATIVE_PATH = '.webpresso/agent-kit-dev-link.json'

export interface DevLinkState {
  package: string
  linkedFrom: string
  linkedAt?: string
  agentKitVersion?: string
  note?: string
}

/**
 * Read + validate the dev-link state file from a consumer's repo root.
 *
 * Returns `null` when:
 *   - the file is absent (CI / never linked) — silent no-op path
 *   - the file is malformed JSON — degrade gracefully, never crash callers
 *   - required fields (`package`, `linkedFrom`) are missing or wrong type
 *
 * Callers MUST treat `null` as "no dev-link active" and proceed silently.
 * Callers that need fail-loud semantics on degraded state (e.g. the postinstall
 * restore bin) should layer their own error handling on top.
 */
export function readDevLinkState(consumerCwd: string): DevLinkState | null {
  const path = join(consumerCwd, STATE_FILE_RELATIVE_PATH)
  if (!existsSync(path)) return null

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null

  const candidate = raw as Record<string, unknown>
  if (typeof candidate.package !== 'string' || candidate.package === '') return null
  if (typeof candidate.linkedFrom !== 'string' || candidate.linkedFrom === '') return null

  return {
    package: candidate.package,
    linkedFrom: candidate.linkedFrom,
    linkedAt: typeof candidate.linkedAt === 'string' ? candidate.linkedAt : undefined,
    agentKitVersion:
      typeof candidate.agentKitVersion === 'string' ? candidate.agentKitVersion : undefined,
    note: typeof candidate.note === 'string' ? candidate.note : undefined,
  }
}
