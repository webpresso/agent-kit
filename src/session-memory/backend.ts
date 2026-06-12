/**
 * Backend loader for the session-memory ctx-rs engine.
 *
 * This branch is ctx-rs-only. Agent-kit owns the vendored ctx-rs source and
 * builds the native binding for the current host on first use.
 */

import type { CtxRsBinding } from './ctx-rs-runtime.js'
import { loadNativeBinding } from './ctx-rs-runtime.js'

export function tryLoadCtxRsSync(): CtxRsBinding | null {
  try {
    return loadNativeBinding()
  } catch {
    return null
  }
}

export function loadCtxRsSync(): CtxRsBinding {
  const mod = tryLoadCtxRsSync()
  if (mod !== null) return mod
  throw new Error(
    'session-memory requires the vendored ctx-rs runtime; no TS fallback runtime is supported on this branch',
  )
}
