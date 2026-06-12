import { describe, expect, it } from 'vitest'

import { HOOK_EVENT_NAMES, WP_HOOK_SPECS } from './ir.js'

describe('WP_HOOK_SPECS', () => {
  it('has 7 specs including dev-link and PreCompact hooks', () => {
    expect(WP_HOOK_SPECS).toHaveLength(7)

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
      'wp-check-dev-link',
      'wp-pretool-guard',
      'wp-post-tool',
      'wp-pre-compact',
      'wp-guard-switch',
      'wp-stop-qa',
    ])
  })

  it('contains the canonical wp hook subcommands in the expected order', () => {
    expect(WP_HOOK_SPECS.map((s) => s.hookName)).toStrictEqual([
      'sessionstart-routing',
      'check-dev-link',
      'pretool-guard',
      'post-tool',
      'pre-compact',
      'guard-switch',
      'stop-qa',
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

  it('wp-stop-qa has jsonOnly: true (Codex mandates JSON-only stdout for Stop)', () => {
    const stop = WP_HOOK_SPECS.find((s) => s.bin === 'wp-stop-qa')
    expect(stop?.jsonOnly).toStrictEqual(true)
  })

  it('only Stop events are currently marked jsonOnly', () => {
    const jsonOnlySpecs = WP_HOOK_SPECS.filter((s) => s.jsonOnly === true)
    expect(jsonOnlySpecs.map((s) => s.event)).toStrictEqual(['Stop'])
  })
})
