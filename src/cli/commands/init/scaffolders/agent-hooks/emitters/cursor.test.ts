import { describe, expect, it } from 'vitest'

import { buildCursorHooksConfig } from './cursor.js'

function cursorCommands(config: ReturnType<typeof buildCursorHooksConfig>): string[] {
  return Object.entries(config)
    .filter((entry): entry is [string, Exclude<(typeof entry)[1], number>] =>
      Array.isArray(entry[1]),
    )
    .flatMap(([, groups]) => groups.flatMap((group) => group.hooks.map((hook) => hook.command)))
}

describe('buildCursorHooksConfig', () => {
  it('emits a Cursor hooks.json with version: 1 and camelCase event keys', () => {
    const config = buildCursorHooksConfig({
      resolveBin: (name) => `$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}`,
      matchers: { preToolUse: 'Bash|Write|Edit|MultiEdit', postToolUse: 'Write|Edit|MultiEdit', postToolBatch: 'Write|Edit|MultiEdit' },
    })

    expect(config.version).toBe(1)
    expect(Object.keys(config).sort()).toStrictEqual(
      ['beforeSubmitPrompt', 'postToolUse', 'preToolUse', 'sessionStart', 'stop', 'version'].sort(),
    )
    expect(config.sessionStart).toHaveLength(1)
    expect(config.preToolUse).toHaveLength(1)
    expect(config.postToolUse).toHaveLength(1)
    expect(config.beforeSubmitPrompt).toHaveLength(1)
    expect(config.stop).toHaveLength(1)
    expect(Object.hasOwn(config, 'SessionStart')).toBe(false)
    expect(Object.hasOwn(config, 'PreToolUse')).toBe(false)
    expect(Object.hasOwn(config, 'PostToolUse')).toBe(false)
    expect(Object.hasOwn(config, 'UserPromptSubmit')).toBe(false)
    expect(Object.hasOwn(config, 'PreCompact')).toBe(false)
  })

  it('marks Cursor preToolUse groups failClosed:true for guard-class hooks', () => {
    const config = buildCursorHooksConfig({
      resolveBin: (name) => `./node_modules/.bin/${name}`,
      matchers: { preToolUse: 'Bash|Write|Edit', postToolUse: 'Write|Edit', postToolBatch: 'Write|Edit' },
    })

    expect(config.preToolUse?.every((group) => group.failClosed === true)).toBe(true)
  })

  it('maps UserPromptSubmit to beforeSubmitPrompt and preserves sessionStart path-stable commands', () => {
    const config = buildCursorHooksConfig({
      resolveBin: (name) =>
        `[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" || true`,
      matchers: { preToolUse: 'Bash|Write|Edit', postToolUse: 'Write|Edit', postToolBatch: 'Write|Edit' },
    })

    expect(
      config.beforeSubmitPrompt?.some((group) =>
        group.hooks.some((hook) => hook.command.includes('wp-guard-switch')),
      ),
    ).toBe(true)
    expect(
      config.sessionStart?.some((group) =>
        group.hooks.some((hook) => hook.command.includes('$CLAUDE_PROJECT_DIR')),
      ),
    ).toBe(true)
  })

  it('rewrites empty shell no-op fallbacks to structured JSON output for Cursor', () => {
    const config = buildCursorHooksConfig({
      resolveBin: (name) =>
        `[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" || true`,
      matchers: { preToolUse: 'Bash|Write|Edit', postToolUse: 'Write|Edit', postToolBatch: 'Write|Edit' },
    })

    const commands = cursorCommands(config)
    expect(commands.every((command) => command.trim().length > 0)).toBe(true)
    expect(commands.every((command) => !/\|\|\s*true\b/u.test(command))).toBe(true)
    expect(commands.every((command) => command.includes("printf '%s\\n' '{}'"))).toBe(true)
  })

  it('omits unsupported Cursor lifecycle hooks instead of emitting accidental degraded keys', () => {
    const config = buildCursorHooksConfig({
      resolveBin: (name) => `./node_modules/.bin/${name}`,
      matchers: { preToolUse: 'Bash|Write|Edit', postToolUse: 'Write|Edit', postToolBatch: 'Write|Edit' },
    })

    expect(Object.hasOwn(config, 'preCompact')).toBe(false)
    expect(Object.hasOwn(config, 'beforeCompact')).toBe(false)
    expect(Object.hasOwn(config, 'postCompact')).toBe(false)
    expect(Object.hasOwn(config, 'permissionRequest')).toBe(false)
    expect(Object.hasOwn(config, 'subagentStart')).toBe(false)
    expect(Object.hasOwn(config, 'subagentStop')).toBe(false)
    expect(Object.hasOwn(config, 'sessionEnd')).toBe(false)
    expect(JSON.stringify(config)).not.toContain('wp-precompact-snapshot')
  })
})
