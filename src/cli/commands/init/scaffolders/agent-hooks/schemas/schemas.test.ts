/**
 * Schema conformance tests — verifies that emitter output parses against
 * the Zod schemas defined for each vendor.
 */

import { describe, expect, it } from 'vitest'

import { buildWebpressoHookGroups } from '#cli/commands/init/scaffolders/agent-hooks/index.js'
import { buildClaudeHookGroups } from '#cli/commands/init/scaffolders/agent-hooks/emitters/claude.js'
import { buildCodexHookGroups } from '#cli/commands/init/scaffolders/agent-hooks/emitters/codex.js'
import { buildCursorHooksConfig } from '#cli/commands/init/scaffolders/agent-hooks/emitters/cursor.js'
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

  // The codex emitter exists as a Tier-1 vendor-output contract; this proves it
  // conforms even though production codex output is currently built by the
  // shared `buildWebpressoHookGroups` path (asserted separately below).
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

  // Fidelity guard: validate the ACTUAL production codex builder
  // (buildManagedCodexHooks → buildWebpressoHookGroups + codex resolver), not
  // only the unwired buildCodexHookGroups emitter, so a regression in the real
  // emitted output is caught.
  it('production codex hook groups (buildWebpressoHookGroups) parse against codexHooksSchema', () => {
    const inner = buildWebpressoHookGroups({
      resolveBin: makeResolveBin('/repo/node_modules/.bin'),
      matchers: TEST_MATCHERS,
    })
    const wrapped = { hooks: inner }
    const result = codexHooksSchema.safeParse(wrapped)
    expect(result.success).toBe(true)
  })

  it('buildCursorHooksConfig() output parses against cursorHooksSchema', () => {
    const config = buildCursorHooksConfig({
      resolveBin: makeResolveBin('/repo/node_modules/.bin'),
      matchers: TEST_MATCHERS,
    })
    const result = cursorHooksSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('a cursor config WITHOUT version fails cursorHooksSchema validation', () => {
    const config = {
      preToolUse: [
        {
          hooks: [
            { type: 'command' as const, command: '/repo/node_modules/.bin/wp-pretool-guard' },
          ],
        },
      ],
    }
    const result = cursorHooksSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('a cursor config with a wrong version fails cursorHooksSchema validation', () => {
    expect(cursorHooksSchema.safeParse({ version: 2 }).success).toBe(false)
    expect(cursorHooksSchema.safeParse({ version: '1' }).success).toBe(false)
  })

  it('an empty {} cursor config fails cursorHooksSchema validation (version required)', () => {
    const result = cursorHooksSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('a cursor config rejects retired or unsupported lifecycle keys but accepts current host-valid preCompact', () => {
    const group = [{ hooks: [{ type: 'command' as const, command: '/repo/node_modules/.bin/wp' }] }]

    expect(cursorHooksSchema.safeParse({ version: 1, preCompact: group }).success).toBe(true)
    expect(cursorHooksSchema.safeParse({ version: 1, PreCompact: group }).success).toBe(false)
    expect(cursorHooksSchema.safeParse({ version: 1, postCompact: group }).success).toBe(false)
    expect(cursorHooksSchema.safeParse({ version: 1, SessionStart: group }).success).toBe(false)
    expect(cursorHooksSchema.safeParse({ version: 1, permissionRequest: group }).success).toBe(
      false,
    )
  })

  it('a cursor config with empty command or empty hook arrays fails validation', () => {
    expect(
      cursorHooksSchema.safeParse({
        version: 1,
        sessionStart: [{ hooks: [{ type: 'command', command: '' }] }],
      }).success,
    ).toBe(false)
    expect(cursorHooksSchema.safeParse({ version: 1, sessionStart: [{ hooks: [] }] }).success).toBe(
      false,
    )
    expect(cursorHooksSchema.safeParse({ version: 1, sessionStart: [] }).success).toBe(false)
  })
})
