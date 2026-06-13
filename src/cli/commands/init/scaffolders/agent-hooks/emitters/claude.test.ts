import { describe, expect, it } from 'vitest'

import { buildWebpressoHookGroups } from '#cli/commands/init/scaffolders/agent-hooks/index.js'
import { buildClaudeHookGroups } from './claude.js'

/**
 * Byte-parity golden test: verifies that buildClaudeHookGroups produces
 * identical output to the original buildWebpressoHookGroups for the same
 * inputs. This is the extraction-parity evidence per extraction-parity.md.
 */
describe('buildClaudeHookGroups (byte-parity)', () => {
  const resolveBin = (name: string) =>
    `[ -x "/repo/.claude/hooks/managed/${name}.sh" ] && "/repo/.claude/hooks/managed/${name}.sh" || true`
  const matchers = {
    preToolUse: 'Bash|Write|Edit|MultiEdit',
    postToolUse: 'Write|Edit|MultiEdit',
  }

  it('produces identical output to buildWebpressoHookGroups (golden parity)', () => {
    const fromOriginal = buildWebpressoHookGroups({ resolveBin, matchers })
    const fromNew = buildClaudeHookGroups({ resolveBin, matchers })
    expect(fromNew).toStrictEqual(fromOriginal)
  })

  it('produces the expected SessionStart structure', () => {
    const result = buildClaudeHookGroups({ resolveBin, matchers })
    expect(result['SessionStart']).toHaveLength(2)
    const commands =
      result['SessionStart']?.flatMap((group) => group.hooks.map((hook) => hook.command)) ?? []
    expect(commands.some((command) => command.includes('wp-sessionstart-routing'))).toBe(true)
    expect(commands.some((command) => command.includes('wp-check-dev-link'))).toBe(true)
  })

  it('produces the expected PreToolUse structure with matcher', () => {
    const result = buildClaudeHookGroups({ resolveBin, matchers })
    expect(result['PreToolUse']).toHaveLength(1)
    expect(result['PreToolUse']?.[0]?.matcher).toStrictEqual('Bash|Write|Edit|MultiEdit')
    expect(result['PreToolUse']?.[0]?.hooks[0]?.command).toContain('wp-pretool-guard')
  })

  it('produces the expected PostToolUse structure with matcher', () => {
    const result = buildClaudeHookGroups({ resolveBin, matchers })
    expect(result['PostToolUse']).toHaveLength(1)
    expect(result['PostToolUse']?.[0]?.matcher).toStrictEqual('Write|Edit|MultiEdit')
    expect(result['PostToolUse']?.[0]?.hooks[0]?.command).toContain('wp-post-tool')
    expect(result['PostToolUse']?.[0]?.hooks[0]?.timeout).toStrictEqual(15)
  })

  it('produces the expected UserPromptSubmit structure', () => {
    const result = buildClaudeHookGroups({ resolveBin, matchers })
    expect(result['UserPromptSubmit']).toHaveLength(1)
    expect(result['UserPromptSubmit']?.[0]?.hooks[0]?.command).toContain('wp-guard-switch')
  })

  it('produces the expected Stop structure with 10s timeout', () => {
    const result = buildClaudeHookGroups({ resolveBin, matchers })
    expect(result['Stop']).toHaveLength(1)
    expect(result['Stop']?.[0]?.hooks[0]?.command).toContain('wp-stop-qa')
    expect(result['Stop']?.[0]?.hooks[0]?.timeout).toStrictEqual(10)
  })

  it('produces groups for the managed emitted event subset', () => {
    const result = buildClaudeHookGroups({ resolveBin, matchers })
    const events = Object.keys(result)
    expect(events).toContain('SessionStart')
    expect(events).toContain('PreToolUse')
    expect(events).toContain('PostToolUse')
    expect(events).toContain('PreCompact')
    expect(events).toContain('UserPromptSubmit')
    expect(events).toContain('Stop')
  })
})
