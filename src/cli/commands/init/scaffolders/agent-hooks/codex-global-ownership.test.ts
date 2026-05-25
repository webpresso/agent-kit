import { describe, expect, it } from 'vitest'

import { isPresetOwnedGlobalCodexHook } from './codex-global-ownership.js'

const EXPECTED_SOURCE_PATHS = ['/home/user/.codex/hooks.json'] as const

function ownedHook(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    isManaged: false,
    handlerType: 'command',
    pluginId: null,
    sourcePath: EXPECTED_SOURCE_PATHS[0],
    command: 'context-mode hook codex pretooluse',
    ...overrides,
  }
}

describe('isPresetOwnedGlobalCodexHook', () => {
  it('accepts context-mode global Codex hooks', () => {
    expect(
      isPresetOwnedGlobalCodexHook(
        ownedHook({ command: 'context-mode hook codex sessionstart' }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(true)
  })

  it('accepts OMX global Codex hooks', () => {
    expect(
      isPresetOwnedGlobalCodexHook(
        ownedHook({
          command:
            'node "/Users/test/.vite-plus/js_runtime/node/24.15.0/lib/node_modules/oh-my-codex/dist/scripts/codex-native-hook.js"',
        }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(true)
  })

  it('rejects repo-local webpresso hook commands from the global selector', () => {
    expect(
      isPresetOwnedGlobalCodexHook(
        ownedHook({
          command:
            '[ -x "/repo/node_modules/.bin/wp-pretool-guard" ] && "/repo/node_modules/.bin/wp-pretool-guard" || true',
        }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(false)
  })

  it('rejects unrelated source paths and malformed metadata', () => {
    expect(
      isPresetOwnedGlobalCodexHook(
        ownedHook({ sourcePath: '/tmp/other/hooks.json' }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(false)
    expect(isPresetOwnedGlobalCodexHook(null, EXPECTED_SOURCE_PATHS)).toBe(false)
  })
})
