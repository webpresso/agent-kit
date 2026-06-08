import { describe, expect, it } from 'vitest'

import { buildCursorHooksConfig } from './cursor.js'

describe('buildCursorHooksConfig', () => {
  it('emits a Cursor hooks.json with version: 1 and camelCase event keys', () => {
    const config = buildCursorHooksConfig({
      resolveBin: (name) => `$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}`,
      matchers: { preToolUse: 'Bash|Write|Edit|MultiEdit', postToolUse: 'Write|Edit|MultiEdit' },
    })

    expect(config.version).toBe(1)
    expect(config.sessionStart?.length).toBeGreaterThan(0)
    expect(config.preToolUse?.length).toBeGreaterThan(0)
    expect(config.postToolUse?.length).toBeGreaterThan(0)
    expect(config.beforeSubmitPrompt?.length).toBeGreaterThan(0)
    expect(config.stop?.length).toBeGreaterThan(0)
  })

  it('marks Cursor preToolUse groups failClosed:true for guard-class hooks', () => {
    const config = buildCursorHooksConfig({
      resolveBin: (name) => `./node_modules/.bin/${name}`,
      matchers: { preToolUse: 'Bash|Write|Edit', postToolUse: 'Write|Edit' },
    })

    expect(config.preToolUse?.every((group) => group.failClosed === true)).toBe(true)
  })

  it('maps UserPromptSubmit to beforeSubmitPrompt and preserves sessionStart path-stable commands', () => {
    const config = buildCursorHooksConfig({
      resolveBin: (name) =>
        `[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" || true`,
      matchers: { preToolUse: 'Bash|Write|Edit', postToolUse: 'Write|Edit' },
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
})
