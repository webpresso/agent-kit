import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  diffEventNames,
  extractCodexHookEventNames,
  GOLDEN_RELATIVE_PATH,
  loadGolden,
} from './codex-hook-event-drift.js'

const SAMPLE_SCHEMA = {
  title: 'HooksListResponse',
  definitions: {
    HookEventName: {
      type: 'string',
      enum: ['preToolUse', 'postToolUse', 'stop'],
    },
  },
}

describe('extractCodexHookEventNames', () => {
  it('pulls the HookEventName enum out of a HooksListResponse schema', () => {
    expect(extractCodexHookEventNames(SAMPLE_SCHEMA)).toStrictEqual([
      'preToolUse',
      'postToolUse',
      'stop',
    ])
  })

  it('throws when the enum is missing (generator layout changed)', () => {
    expect(() => extractCodexHookEventNames({ definitions: {} })).toThrow(/HookEventName enum/u)
  })

  it('throws on an empty enum rather than reporting every event removed', () => {
    expect(() =>
      extractCodexHookEventNames({ definitions: { HookEventName: { enum: [] } } }),
    ).toThrow(/HookEventName enum/u)
  })

  it('throws when an enum member is not a string', () => {
    expect(() =>
      extractCodexHookEventNames({ definitions: { HookEventName: { enum: ['preToolUse', 7] } } }),
    ).toThrow(/non-string/u)
  })
})

describe('diffEventNames', () => {
  it('reports in-sync when sets match regardless of order', () => {
    expect(diffEventNames(['stop', 'preToolUse'], ['preToolUse', 'stop'])).toStrictEqual({
      inSync: true,
      added: [],
      removed: [],
    })
  })

  it('reports an upstream-added event', () => {
    const diff = diffEventNames(['preToolUse', 'newEvent'], ['preToolUse'])
    expect(diff.inSync).toBe(false)
    expect(diff.added).toStrictEqual(['newEvent'])
    expect(diff.removed).toStrictEqual([])
  })

  it('reports an upstream-removed event', () => {
    const diff = diffEventNames(['preToolUse'], ['preToolUse', 'retiredEvent'])
    expect(diff.inSync).toBe(false)
    expect(diff.added).toStrictEqual([])
    expect(diff.removed).toStrictEqual(['retiredEvent'])
  })
})

describe('golden', () => {
  it('the checked-in golden matches Codex 0.142.0 and is self-consistent', () => {
    const golden = loadGolden(process.cwd())
    // Sanity: the events our codex matcher relies on must be present in the golden.
    for (const required of ['preToolUse', 'postToolUse', 'sessionStart', 'stop']) {
      expect(golden.eventNames).toContain(required)
    }
    // The golden file the runner loads is the one we assert here.
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), GOLDEN_RELATIVE_PATH), 'utf8'),
    ) as { eventNames: string[] }
    expect(raw.eventNames).toStrictEqual([...golden.eventNames])
    // A golden compared against itself is always in sync.
    expect(diffEventNames(golden.eventNames, golden.eventNames).inSync).toBe(true)
  })
})
