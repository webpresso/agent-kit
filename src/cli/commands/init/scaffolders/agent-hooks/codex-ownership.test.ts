import { describe, expect, it } from 'vitest'

import { isAgentKitOwnedCodexHook, KNOWN_AGENT_KIT_CODEX_BINS } from './codex-ownership.js'

const EXPECTED_SOURCE_PATHS = ['/repo/.codex/hooks.json', '/repo/.codex/extra-hooks.json'] as const

function ownedHook(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    isManaged: false,
    handlerType: 'command',
    pluginId: null,
    sourcePath: EXPECTED_SOURCE_PATHS[0],
    command: './node_modules/.bin/ak-pretool-guard',
    ...overrides,
  }
}

describe('isAgentKitOwnedCodexHook', () => {
  it('accepts unmanaged command hooks from expected source paths that directly target current agent-kit bins', () => {
    for (const binName of KNOWN_AGENT_KIT_CODEX_BINS) {
      expect(
        isAgentKitOwnedCodexHook(
          ownedHook({ command: `./node_modules/.bin/${binName}` }),
          EXPECTED_SOURCE_PATHS,
        ),
      ).toBe(true)
    }
  })

  it('accepts quoted absolute node_modules bin paths', () => {
    expect(
      isAgentKitOwnedCodexHook(
        ownedHook({ command: '"/repo/node_modules/.bin/ak-post-tool"' }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(true)
  })

  it('accepts guarded absolute node_modules bin commands', () => {
    expect(
      isAgentKitOwnedCodexHook(
        ownedHook({
          command:
            '[ -x "/repo/node_modules/.bin/ak-post-tool" ] && "/repo/node_modules/.bin/ak-post-tool" || true',
        }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(true)
  })

  it('rejects arbitrary Bash and Python hook commands', () => {
    expect(
      isAgentKitOwnedCodexHook(
        ownedHook({ command: 'bash .codex/hooks/pre-tool.sh' }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(false)
    expect(
      isAgentKitOwnedCodexHook(
        ownedHook({ command: 'python .codex/hooks/post-tool.py' }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(false)
  })

  it('rejects managed hooks, non-command handlers, and plugin-owned hooks', () => {
    expect(isAgentKitOwnedCodexHook(ownedHook({ isManaged: true }), EXPECTED_SOURCE_PATHS)).toBe(
      false,
    )
    expect(
      isAgentKitOwnedCodexHook(ownedHook({ handlerType: 'python' }), EXPECTED_SOURCE_PATHS),
    ).toBe(false)
    expect(
      isAgentKitOwnedCodexHook(
        ownedHook({ pluginId: 'webpresso.agent-kit' }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(false)
  })

  it('rejects metadata without the required unmanaged plugin-null shape', () => {
    expect(
      isAgentKitOwnedCodexHook(ownedHook({ isManaged: undefined }), EXPECTED_SOURCE_PATHS),
    ).toBe(false)
    expect(
      isAgentKitOwnedCodexHook(ownedHook({ pluginId: undefined }), EXPECTED_SOURCE_PATHS),
    ).toBe(false)
  })

  it('rejects unrelated source paths and missing commands', () => {
    expect(
      isAgentKitOwnedCodexHook(
        ownedHook({ sourcePath: '/tmp/unrelated/hooks.json' }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(false)
    expect(isAgentKitOwnedCodexHook(ownedHook({ command: undefined }), EXPECTED_SOURCE_PATHS)).toBe(
      false,
    )
  })

  it('rejects commands that do not directly target known agent-kit node_modules bins', () => {
    expect(
      isAgentKitOwnedCodexHook(
        ownedHook({ command: './node_modules/.bin/ak' }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(false)
    expect(
      isAgentKitOwnedCodexHook(
        ownedHook({ command: './node_modules/.bin/ak-test-quality-check' }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(false)
    expect(
      isAgentKitOwnedCodexHook(
        ownedHook({ command: 'echo ./node_modules/.bin/ak-pretool-guard' }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(false)
  })

  it('rejects malformed metadata and empty expected source allowlists', () => {
    expect(isAgentKitOwnedCodexHook(null, EXPECTED_SOURCE_PATHS)).toBe(false)
    expect(isAgentKitOwnedCodexHook('not metadata', EXPECTED_SOURCE_PATHS)).toBe(false)
    expect(isAgentKitOwnedCodexHook(ownedHook(), [])).toBe(false)
  })
})
