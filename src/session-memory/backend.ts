/**
 * Backend abstraction for the session-memory engine.
 *
 * v2.0 ships with both backends. The ctx-rs Rust engine is the default.
 * Select via environment variable:
 *   AK_SESSION_ENGINE=ctx-rs  (default)
 *   AK_SESSION_ENGINE=ts      (fallback to better-sqlite3 TS engine)
 *
 * AK_DISABLE_CTX=1 forces the TS fallback if ctx-rs prebuilt is unavailable.
 */

import { createRequire } from 'node:module'

import type { SessionEngineBackend } from './types.js'

/**
 * Resolve the active engine backend from the environment.
 * Priority:
 *  1. AK_DISABLE_CTX=1  → always 'ts'
 *  2. AK_SESSION_ENGINE → explicit override
 *  3. Default           → 'ctx-rs'
 */
export function resolveBackend(): SessionEngineBackend {
  if (process.env['AK_DISABLE_CTX'] === '1') {
    return 'ts'
  }
  const env = process.env['AK_SESSION_ENGINE']
  if (env === 'ts' || env === 'ctx-rs') {
    return env
  }
  return 'ctx-rs'
}

/**
 * Synchronously load ctx-rs using createRequire.
 * ctx-rs/index.js ships as CommonJS so require() is the correct loader.
 * Returns null if unavailable (missing prebuilt, unsupported platform, AK_DISABLE_CTX=1).
 */
export function tryLoadCtxRsSync(): typeof import('@webpresso/ctx-rs') | null {
  if (resolveBackend() === 'ts') {
    return null
  }
  try {
    const requireFn = createRequire(import.meta.url)
    const mod = requireFn('@webpresso/ctx-rs') as typeof import('@webpresso/ctx-rs')
    // Verify the native binding is loaded (not just the JS wrapper)
    if (mod.loadNativeBinding() === null) {
      return null
    }
    return mod
  } catch (err: unknown) {
    process.stderr.write(
      `ak-session-memory: ctx-rs load error: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return null
  }
}
