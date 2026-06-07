import { describe, expect, it } from 'vitest'

import { ensureGroup, mergeAgentKitGroups } from './merge.js'
import type { HookGroup, HooksMap } from './ir.js'

describe('ensureGroup', () => {
  it('appends a new group when no matching command exists', () => {
    const groups: HookGroup[] = [
      { hooks: [{ type: 'command', command: 'existing-cmd' }] },
    ]
    const incoming: HookGroup = {
      hooks: [{ type: 'command', command: 'new-cmd' }],
    }
    const result = ensureGroup(groups, incoming)
    expect(result).toHaveLength(2)
    expect(result[1]).toStrictEqual(incoming)
  })

  it('does not duplicate a group whose command already exists', () => {
    const existing: HookGroup = {
      hooks: [{ type: 'command', command: 'same-cmd', timeout: 5 }],
    }
    const incoming: HookGroup = {
      hooks: [{ type: 'command', command: 'same-cmd', timeout: 5 }],
    }
    const result = ensureGroup([existing], incoming)
    expect(result).toHaveLength(1)
  })

  it('updates timeout on existing hook when command matches', () => {
    const existing: HookGroup = {
      hooks: [{ type: 'command', command: 'same-cmd', timeout: 5 }],
    }
    const incoming: HookGroup = {
      hooks: [{ type: 'command', command: 'same-cmd', timeout: 10 }],
    }
    const result = ensureGroup([existing], incoming)
    expect(result).toHaveLength(1)
    expect(result[0]?.hooks[0]?.timeout).toStrictEqual(10)
  })

  it('updates matcher on existing group when command matches', () => {
    const existing: HookGroup = {
      hooks: [{ type: 'command', command: 'same-cmd' }],
    }
    const incoming: HookGroup = {
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'same-cmd' }],
    }
    const result = ensureGroup([existing], incoming)
    expect(result).toHaveLength(1)
    expect(result[0]?.matcher).toStrictEqual('Bash')
  })

  it('returns original groups when incoming has no hooks', () => {
    const groups: HookGroup[] = [{ hooks: [{ type: 'command', command: 'cmd' }] }]
    const empty: HookGroup = { hooks: [] }
    const result = ensureGroup(groups, empty)
    expect(result).toStrictEqual(groups)
  })

  it('preserves command from existing hook (not incoming) on match', () => {
    // The consumer's already-materialized command form must be preserved
    const existing: HookGroup = {
      hooks: [{ type: 'command', command: '[ -x "/repo/.codex/managed-hooks/wp-stop-qa.sh" ] && "/repo/.codex/managed-hooks/wp-stop-qa.sh" || true', timeout: 5 }],
    }
    const incoming: HookGroup = {
      hooks: [{ type: 'command', command: '[ -x "/new-repo/.codex/managed-hooks/wp-stop-qa.sh" ] && "/new-repo/.codex/managed-hooks/wp-stop-qa.sh" || true', timeout: 10 }],
    }
    const result = ensureGroup([existing], incoming)
    expect(result).toHaveLength(1)
    // command must be from existing, not incoming
    expect(result[0]?.hooks[0]?.command).toStrictEqual(existing.hooks[0]?.command)
    // but timeout updated from incoming
    expect(result[0]?.hooks[0]?.timeout).toStrictEqual(10)
  })
})

describe('mergeAgentKitGroups', () => {
  it('merges two maps combining their events', () => {
    const existing: HooksMap = {
      SessionStart: [{ hooks: [{ type: 'command', command: 'existing-session' }] }],
    }
    const addition: HooksMap = {
      Stop: [{ hooks: [{ type: 'command', command: 'new-stop' }] }],
    }
    const result = mergeAgentKitGroups(existing, addition)
    expect(result['SessionStart']).toHaveLength(1)
    expect(result['Stop']).toHaveLength(1)
  })

  it('deduplicates groups within the same event', () => {
    const existing: HooksMap = {
      Stop: [{ hooks: [{ type: 'command', command: 'stop-cmd' }] }],
    }
    const addition: HooksMap = {
      Stop: [{ hooks: [{ type: 'command', command: 'stop-cmd' }] }],
    }
    const result = mergeAgentKitGroups(existing, addition)
    expect(result['Stop']).toHaveLength(1)
  })

  it('appends new groups for existing events', () => {
    const existing: HooksMap = {
      SessionStart: [{ hooks: [{ type: 'command', command: 'first' }] }],
    }
    const addition: HooksMap = {
      SessionStart: [{ hooks: [{ type: 'command', command: 'second' }] }],
    }
    const result = mergeAgentKitGroups(existing, addition)
    expect(result['SessionStart']).toHaveLength(2)
  })

  it('does not mutate the existing map', () => {
    const existing: HooksMap = {
      Stop: [{ hooks: [{ type: 'command', command: 'stop-cmd' }] }],
    }
    const addition: HooksMap = {
      Stop: [{ hooks: [{ type: 'command', command: 'new-cmd' }] }],
    }
    mergeAgentKitGroups(existing, addition)
    expect(existing['Stop']).toHaveLength(1)
  })
})
