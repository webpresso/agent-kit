import { describe, expect, it } from 'vitest'

import { HOOK_EVENT_NAMES, WP_HOOK_SPECS } from './ir.js'

describe('WP_HOOK_SPECS', () => {
  it('has the 6 managed wp-* hook specs', () => {
    expect(WP_HOOK_SPECS).toHaveLength(6)

    const byEvent = WP_HOOK_SPECS.reduce<Record<string, number>>((acc, spec) => {
      acc[spec.event] = (acc[spec.event] ?? 0) + 1
      return acc
    }, {})

    expect(byEvent['SessionStart']).toStrictEqual(1)
    expect(byEvent['PreToolUse']).toStrictEqual(1)
    expect(byEvent['PostToolUse']).toStrictEqual(1)
    expect(byEvent['UserPromptSubmit']).toStrictEqual(1)
    expect(byEvent['Stop']).toStrictEqual(1)
    expect(byEvent['PreCompact']).toStrictEqual(1)
  })

  it('all events are members of HOOK_EVENT_NAMES', () => {
    const validEvents = new Set<string>(HOOK_EVENT_NAMES)
    for (const spec of WP_HOOK_SPECS) {
      expect(validEvents.has(spec.event)).toStrictEqual(true)
    }
  })

  it('HOOK_EVENT_NAMES includes the wider documented lifecycle used by dispatch/demo tooling', () => {
    expect(HOOK_EVENT_NAMES).toEqual(
      expect.arrayContaining([
        'PostToolUseFailure',
        'PermissionRequest',
        'SubagentStart',
        'SubagentStop',
        'SessionEnd',
        'PreCompact',
        'PostCompact',
      ]),
    )
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
      'wp-pretool-guard',
      'wp-post-tool',
      'wp-guard-switch',
      'wp-stop-qa',
      'wp-precompact-snapshot',
    ])
  })

  it('contains the canonical wp hook subcommands in the expected order', () => {
    expect(WP_HOOK_SPECS.map((s) => s.hookName)).toStrictEqual([
      'sessionstart-routing',
      'pretool-guard',
      'post-tool',
      'guard-switch',
      'stop-qa',
      'precompact-snapshot',
    ])
  })

  it('precompact is a managed PreCompact hook without a tool matcher', () => {
    const preCompact = WP_HOOK_SPECS.find((s) => s.bin === 'wp-precompact-snapshot')
    expect(preCompact).toMatchObject({
      event: 'PreCompact',
      bin: 'wp-precompact-snapshot',
      hookName: 'precompact-snapshot',
    })
    expect(preCompact?.matcher).toBe(undefined)
  })

  it('pretool-guard has preToolUse matcher', () => {
    const pretool = WP_HOOK_SPECS.find((s) => s.bin === 'wp-pretool-guard')
    expect(pretool?.matcher).toStrictEqual('preToolUse')
  })

  it('post-tool has the PostToolUse matcher', () => {
    const postToolSpecs = WP_HOOK_SPECS.filter((s) => s.bin === 'wp-post-tool')
    expect(postToolSpecs.map((s) => [s.event, s.matcher])).toEqual([['PostToolUse', 'postToolUse']])
  })

  it('all timeouts are positive integers', () => {
    for (const spec of WP_HOOK_SPECS) {
      expect(spec.timeout).toBeGreaterThan(0)
      expect(Number.isInteger(spec.timeout)).toStrictEqual(true)
    }
  })

  it('wp-stop-qa has jsonOnly: true (Codex mandates JSON-only stdout for Stop)', () => {
    const stop = WP_HOOK_SPECS.find((s) => s.bin === 'wp-stop-qa')
    expect(stop?.jsonOnly).toStrictEqual(true)
  })

  it('only host-required JSON events are marked jsonOnly', () => {
    const jsonOnlySpecs = WP_HOOK_SPECS.filter((s) => s.jsonOnly === true)
    expect(jsonOnlySpecs.map((s) => s.event)).toStrictEqual(['Stop', 'PreCompact'])
  })
})
