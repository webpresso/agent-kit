/**
 * Session memory performance benchmarks — Task 4.2.
 *
 * Measures hot-path operations:
 *  - captureEvent: must be <0.5ms p99
 *  - search: must be <2ms p99
 *
 * Run via: pnpm exec vitest bench tests/perf/session-capture.bench.ts
 * CI: .github/workflows/session-perf.yml
 */
import { bench, describe } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

// Import session-memory engine directly
import { captureEvent } from '../../src/session-memory/session.js'
import { getStore } from '../../src/session-memory/store.js'

const tempDir = mkdtempSync(join(tmpdir(), 'ak-session-bench-'))
const REPO_HASH = 'bench-perf-0001'

// Pre-populate store with test data
const dbPath = join(tempDir, `${REPO_HASH}.db`)
const store = getStore(dbPath)
const testChunks = Array.from({ length: 1000 }, (_, i) => ({
  content: `Agent-kit session memory engine benchmark chunk ${i}. TypeScript Rust napi-rs SQLite FTS5 porter trigram Levenshtein fallback hot-path performance target.`,
  source: `bench-source-${i % 10}`,
}))
store.insertChunks(testChunks)

describe('session memory hot-path benchmarks', () => {
  let eventCounter = 0

  bench(
    'captureEvent — hot path (<0.5ms p99)',
    () => {
      eventCounter++
      captureEvent(
        {
          repoHash: REPO_HASH,
          event: {
            sessionId: 'bench-session',
            toolName: 'Bash',
            content: `git status --short event ${eventCounter}`,
          },
        },
        tempDir,
      )
    },
    { time: 2000, iterations: 500 },
  )

  bench(
    'search porter — hot path (<2ms p99)',
    () => {
      store.search({ query: 'TypeScript Rust napi', limit: 10 })
    },
    { time: 2000, iterations: 200 },
  )

  bench(
    'search scoped — hot path (<2ms p99)',
    () => {
      store.search({ query: 'session memory engine', limit: 10, source: 'bench-source-0' })
    },
    { time: 2000, iterations: 200 },
  )

  bench(
    'search with fallback — cold query (<5ms)',
    () => {
      store.search({ query: randomUUID(), limit: 10 })
    },
    { time: 1000, iterations: 50 },
  )
})
