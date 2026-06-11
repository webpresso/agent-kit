/**
 * Backend abstraction for the session-memory engine.
 *
 * v2.0 ships with both backends. The ctx-rs Rust engine is the default.
 * Select via environment variable:
 *   AK_SESSION_ENGINE=ctx-rs  (default)
 *   AK_SESSION_ENGINE=ts      (fallback to the TypeScript SQLite engine)
 *
 * AK_DISABLE_CTX=1 forces the TS fallback if ctx-rs prebuilt is unavailable.
 */

import { createRequire } from 'node:module'

import type { SessionEngineBackend } from './types.js'

type CtxRsModule = typeof import('@webpresso/ctx-rs')
type CtxRsSyncLoader = () => CtxRsModule

function defaultCtxRsSyncLoader(): CtxRsModule {
  const requireFn = createRequire(import.meta.url)
  return requireFn('@webpresso/ctx-rs') as CtxRsModule
}

let ctxRsSyncLoader: CtxRsSyncLoader = defaultCtxRsSyncLoader

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
 * Synchronously load ctx-rs using the module's current sync loader.
 * Returns null if unavailable (missing prebuilt, unsupported platform, AK_DISABLE_CTX=1).
 */
export function tryLoadCtxRsSync(): CtxRsModule | null {
  if (resolveBackend() === 'ts') {
    return null
  }
  try {
    const mod = ctxRsSyncLoader()
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

/**
 * Test-only seam for deterministic backend loading coverage.
 * Pass null to restore the production loader.
 */
export function setCtxRsSyncLoaderForTests(loader: CtxRsSyncLoader | null): void {
  ctxRsSyncLoader = loader ?? defaultCtxRsSyncLoader
}
