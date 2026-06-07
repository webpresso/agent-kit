import { describe, expect, it } from 'vitest'

import { HOOK_EVENT_NAMES, WP_HOOK_SPECS } from './ir.js'

describe('WP_HOOK_SPECS', () => {
  it('has 6 specs (2 SessionStart, 1 PreToolUse, 1 PostToolUse, 1 UserPromptSubmit, 1 Stop)', () => {
    expect(WP_HOOK_SPECS).toHaveLength(6)

    const byEvent = WP_HOOK_SPECS.reduce<Record<string, number>>((acc, spec) => {
      acc[spec.event] = (acc[spec.event] ?? 0) + 1
      return acc
    }, {})

    expect(byEvent['SessionStart']).toStrictEqual(2)
    expect(byEvent['PreToolUse']).toStrictEqual(1)
    expect(byEvent['PostToolUse']).toStrictEqual(1)
    expect(byEvent['UserPromptSubmit']).toStrictEqual(1)
    expect(byEvent['Stop']).toStrictEqual(1)
  })

  it('all events are members of HOOK_EVENT_NAMES', () => {
    const validEvents = new Set<string>(HOOK_EVENT_NAMES)
    for (const spec of WP_HOOK_SPECS) {
      expect(validEvents.has(spec.event)).toStrictEqual(true)
    }
  })

  it('specs with matcher reference valid MatcherSet keys', () => {
    const validMatcherKeys = new Set<string>(['preToolUse', 'postToolUse'])
    for (const spec of WP_HOOK_SPECS) {
      if (spec.matcher !== undefined) {
        expect(validMatcherKeys.has(spec.matcher)).toStrictEqual(true)
      }
    }
  })

  it('contains the canonical bin names in the expected order', () => {
    const bins = WP_HOOK_SPECS.map((s) => s.bin)
    expect(bins).toStrictEqual([
      'wp-sessionstart-routing',
      'wp-check-dev-link',
      'wp-pretool-guard',
      'wp-post-tool',
      'wp-guard-switch',
      'wp-stop-qa',
    ])
  })

  it('pretool-guard has preToolUse matcher', () => {
    const pretool = WP_HOOK_SPECS.find((s) => s.bin === 'wp-pretool-guard')
    expect(pretool?.matcher).toStrictEqual('preToolUse')
  })

  it('post-tool has postToolUse matcher', () => {
    const postTool = WP_HOOK_SPECS.find((s) => s.bin === 'wp-post-tool')
    expect(postTool?.matcher).toStrictEqual('postToolUse')
  })

  it('all timeouts are positive integers', () => {
    for (const spec of WP_HOOK_SPECS) {
      expect(spec.timeout).toBeGreaterThan(0)
      expect(Number.isInteger(spec.timeout)).toStrictEqual(true)
    }
  })
})
