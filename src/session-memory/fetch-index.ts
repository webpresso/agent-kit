/**
 * HTTP fetch + index — ctx-rs backend only.
 *
 * This branch does not fall back to a TS engine. If ctx-rs is missing or
 * reports an unavailable status, callers get a loud error.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { loadCtxRsSync } from './backend.js'
import type { FetchIndexOptions, FetchIndexResult } from './types.js'
import { isUnavailable } from './types.js'

export async function fetchAndIndex(options: FetchIndexOptions): Promise<FetchIndexResult> {
  const { url, dbPath } = options
  mkdirSync(dirname(dbPath), { recursive: true })

  const ctxRs = loadCtxRsSync()
  const result = await ctxRs.fetchAndIndex(dbPath, url)
  if (isUnavailable(result)) {
    throw new Error('ctx-rs unavailable for fetchAndIndex')
  }

  const fetchResult = result as { url: string; chunkCount: number }
  return {
    url: fetchResult.url,
    chunkCount: fetchResult.chunkCount,
    cached: false,
  }
}
