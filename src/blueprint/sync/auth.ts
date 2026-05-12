/**
 * Credential loading for the BlueprintSyncClient.
 *
 * Reads configuration from environment variables; never writes to disk.
 *
 * Environment variables:
 *   AK_BLUEPRINT_PLATFORM_DISABLED  — set to "1" to bypass all platform ops
 *   AK_BLUEPRINT_PLATFORM_TOKEN     — required Bearer token
 *   AK_BLUEPRINT_PLATFORM_URL       — override API base URL (default: https://api.webpresso.io)
 */

import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'

export interface SyncCredentials {
  readonly token: string
  readonly platformUrl: string
  readonly repoId: string
}

const DEFAULT_PLATFORM_URL = 'https://api.webpresso.io'

/**
 * Derive a stable, opaque repo identifier from the git remote origin URL.
 *
 * Falls back to a hash of the CWD when git is unavailable (e.g. in tests
 * where there is no remote). The returned value is a lowercase hex string.
 */
function deriveRepoId(): string {
  let input: string

  try {
    const remote = execSync('git remote get-url origin', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    input = remote.length > 0 ? remote : process.cwd()
  } catch {
    input = process.cwd()
  }

  return createHash('sha256').update(input).digest('hex')
}

/**
 * Load sync credentials from the environment.
 *
 * Returns `null` when:
 *  - `AK_BLUEPRINT_PLATFORM_DISABLED=1` (emergency escape hatch), or
 *  - `AK_BLUEPRINT_PLATFORM_TOKEN` is not set or is an empty string.
 *
 * The caller must treat `null` as "sync is unavailable" and bypass all
 * platform operations.
 */
export function loadSyncCredentials(): SyncCredentials | null {
  if (process.env['AK_BLUEPRINT_PLATFORM_DISABLED'] === '1') {
    return null
  }

  const token = process.env['AK_BLUEPRINT_PLATFORM_TOKEN'] ?? ''
  if (token.length === 0) {
    return null
  }

  const platformUrl = process.env['AK_BLUEPRINT_PLATFORM_URL'] ?? DEFAULT_PLATFORM_URL

  return {
    token,
    platformUrl,
    repoId: deriveRepoId(),
  }
}
