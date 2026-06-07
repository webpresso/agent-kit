/**
 * Schema conformance tests — verifies that emitter output parses against
 * the Zod schemas defined for each vendor.
 */

import { describe, expect, it } from 'vitest'

import { buildClaudeHookGroups } from '#cli/commands/init/scaffolders/agent-hooks/emitters/claude.js'
import { buildCodexHookGroups } from '#cli/commands/init/scaffolders/agent-hooks/emitters/codex.js'
import { claudeHooksSchema } from './claude-hooks.schema.js'
import { codexHooksSchema } from './codex-hooks.schema.js'
import { cursorHooksSchema } from './cursor-hooks.schema.js'

const TEST_MATCHERS = {
  preToolUse: 'Bash|Write|Edit',
  postToolUse: 'Bash|Write|Edit',
} as const

function makeResolveBin(prefix: string): (name: string) => string {
  return (name) => `${prefix}/${name}`
}

function makeCodexResolveBin(prefix: string): (repoRoot: string) => (name: string) => string {
  return (repoRoot) => (name) => `${repoRoot}/${prefix}/${name}`
}

describe('vendor hook schemas', () => {
  it('buildClaudeHookGroups() output parses against claudeHooksSchema', () => {
    const output = buildClaudeHookGroups({
      resolveBin: makeResolveBin('/repo/node_modules/.bin'),
      matchers: TEST_MATCHERS,
    })
    const result = claudeHooksSchema.safeParse(output)
    expect(result.success).toBe(true)
  })

  it('buildCodexHookGroups() output wrapped in { hooks } parses against codexHooksSchema', () => {
    const inner = buildCodexHookGroups({
      resolveBin: makeCodexResolveBin('node_modules/.bin'),
      matchers: TEST_MATCHERS,
      repoRoot: '/repo',
    })
    const wrapped = { hooks: inner }
    const result = codexHooksSchema.safeParse(wrapped)
    expect(result.success).toBe(true)
  })

  it('a valid cursor config with version:1 parses against cursorHooksSchema', () => {
    const config = {
      version: 1,
      preToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command' as const, command: '/repo/node_modules/.bin/wp-pretool-guard' }],
        },
      ],
    }
    const result = cursorHooksSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('a cursor config WITHOUT version fails cursorHooksSchema validation', () => {
    const config = {
      preToolUse: [
        {
          hooks: [{ type: 'command' as const, command: '/repo/node_modules/.bin/wp-pretool-guard' }],
        },
      ],
    }
    const result = cursorHooksSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('an empty {} cursor config fails cursorHooksSchema validation (version required)', () => {
    const result = cursorHooksSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
