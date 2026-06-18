import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { SessionMemoryStore } from '#session-memory/store.js'
import { createGainSummaryResult, measureToolResultBytes, utf8ByteLength } from './_session-gain.js'

const dirs: string[] = []

function dbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wp-session-gain-test-'))
  dirs.push(dir)
  return join(dir, 'index.sqlite')
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('session gain telemetry', () => {
  it('uses exact UTF-8 byte math and approximate byte/4 tokens', () => {
    expect(utf8ByteLength('abc')).toBe(3)
    expect(utf8ByteLength('界')).toBe(3)
    expect(utf8ByteLength('😀')).toBe(4)

    const path = dbPath()
    const result = createGainSummaryResult(
      { passed: true, summary: 'emoji ok 😀' },
      {},
      { toolName: 'wp_session_index', dbPath: path, rawBasisBytes: 1_000, rawBytesBasis: 'index_accepted_text' },
    )
    const gain = result.structuredContent?.gain as { returnedToolResultBytes: number; gainBytes: number; approxTokensSaved: number }

    expect(gain.returnedToolResultBytes).toBe(measureToolResultBytes(result))
    expect(gain.gainBytes).toBe(1_000 - gain.returnedToolResultBytes)
    expect(gain.approxTokensSaved).toBe(Math.floor(gain.gainBytes / 4))
  })

  it('stores zero-gain events when telemetry overhead exceeds the raw basis', () => {
    const path = dbPath()
    const result = createGainSummaryResult(
      { passed: true, summary: 'tiny' },
      {},
      { toolName: 'wp_session_execute', dbPath: path, rawBasisBytes: 1, rawBytesBasis: 'command_output_total' },
    )
    const gain = result.structuredContent?.gain as { gainBytes: number }
    expect(gain.gainBytes).toBe(0)

    const store = new SessionMemoryStore(path)
    expect(store.gainStats()).toMatchObject({ eventCount: 1, gainBytes: 0 })
    store.close()
  })

  it('omits gain and returns a warning if fixed-point sizing does not converge', () => {
    const path = dbPath()
    let measured = 0
    const result = createGainSummaryResult(
      { passed: true, summary: 'unstable' },
      {},
      {
        toolName: 'wp_session_index',
        dbPath: path,
        rawBasisBytes: 100,
        rawBytesBasis: 'index_accepted_text',
        measureResultBytes: () => {
          measured += 1
          return measured
        },
      },
    )

    expect(result.structuredContent?.gain).toBeUndefined()
    expect(measured).toBe(5)
    expect(result.structuredContent?.warnings).toEqual([
      'gain telemetry sizing did not converge after 5 iterations; omitted gain for this call',
    ])
    const store = new SessionMemoryStore(path)
    expect(store.gainStats().eventCount).toBe(0)
    store.close()
  })
})
