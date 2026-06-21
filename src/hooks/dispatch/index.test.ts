import { describe, expect, it } from 'vitest'

import type { HooksMap } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'
import { dispatch } from '#hooks/dispatch/index.js'

const REPO_ROOT = '/tmp/test-repo'

const BASE_OPTIONS = {
  vendor: 'claude' as const,
  repoRoot: REPO_ROOT,
}

describe('dispatch', () => {
  it('throws for an unknown event with a list of valid events', async () => {
    const hooksMap: HooksMap = {}
    await expect(dispatch(hooksMap, { ...BASE_OPTIONS, event: 'UnknownEvent' })).rejects.toThrow(
      /Valid events:/,
    )
  })

  it('throws error message that includes the invalid event name', async () => {
    const hooksMap: HooksMap = {}
    await expect(dispatch(hooksMap, { ...BASE_OPTIONS, event: 'BogusEvent' })).rejects.toThrow(
      /BogusEvent/,
    )
  })

  it('returns empty hooks array for a valid event with no registered hooks', async () => {
    const hooksMap: HooksMap = {}
    const result = await dispatch(hooksMap, { ...BASE_OPTIONS, event: 'SessionStart' })
    expect(result).toStrictEqual({
      event: 'SessionStart',
      vendor: 'claude',
      hooks: [],
    })
  })

  it('returns the registered hooks for a valid event', async () => {
    const hooksMap: HooksMap = {
      SessionStart: [
        {
          hooks: [{ type: 'command', command: 'node /pkg/bin/wp hook sessionstart-routing # wp-sessionstart-routing' }],
        },
      ],
    }
    const result = await dispatch(hooksMap, { ...BASE_OPTIONS, event: 'SessionStart' })
    expect(result.event).toStrictEqual('SessionStart')
    expect(result.vendor).toStrictEqual('claude')
    expect(result.hooks).toStrictEqual([
      {
        command: 'node /pkg/bin/wp hook sessionstart-routing # wp-sessionstart-routing',
        matcher: undefined,
      },
    ])
  })

  it('includes matcher when PreToolUse group has a matcher', async () => {
    const hooksMap: HooksMap = {
      PreToolUse: [
        {
          matcher: 'Bash|Edit|Write',
          hooks: [{ type: 'command', command: 'node /pkg/bin/wp hook pretool-guard # wp-pretool-guard' }],
        },
      ],
    }
    const result = await dispatch(hooksMap, { ...BASE_OPTIONS, event: 'PreToolUse' })
    expect(result.hooks).toStrictEqual([
      {
        command: 'node /pkg/bin/wp hook pretool-guard # wp-pretool-guard',
        matcher: 'Bash|Edit|Write',
      },
    ])
  })

  it('flattens multiple hook entries across groups for the same event', async () => {
    const hooksMap: HooksMap = {
      Stop: [
        {
          hooks: [{ type: 'command', command: 'node /pkg/bin/wp hook stop-qa # wp-stop-qa' }],
        },
        {
          hooks: [{ type: 'command', command: 'echo extra-stop-hook' }],
        },
      ],
    }
    const result = await dispatch(hooksMap, { ...BASE_OPTIONS, event: 'Stop' })
    expect(result.hooks).toHaveLength(2)
    expect(result.hooks[0]?.command).toStrictEqual('node /pkg/bin/wp hook stop-qa # wp-stop-qa')
    expect(result.hooks[1]?.command).toStrictEqual('echo extra-stop-hook')
  })

  it('returns undefined matcher when group has no matcher field', async () => {
    const hooksMap: HooksMap = {
      UserPromptSubmit: [
        {
          hooks: [{ type: 'command', command: 'node /pkg/bin/wp hook guard-switch # wp-guard-switch' }],
        },
      ],
    }
    const result = await dispatch(hooksMap, { ...BASE_OPTIONS, event: 'UserPromptSubmit' })
    expect(result.hooks[0]).toStrictEqual({
      command: 'node /pkg/bin/wp hook guard-switch # wp-guard-switch',
      matcher: undefined,
    })
  })

  it('reflects the vendor in the result', async () => {
    const hooksMap: HooksMap = {}
    const result = await dispatch(hooksMap, {
      ...BASE_OPTIONS,
      vendor: 'codex',
      event: 'SessionStart',
    })
    expect(result.vendor).toStrictEqual('codex')
  })

  it('accepts extended documented lifecycle events even when no hooks are registered', async () => {
    const hooksMap: HooksMap = {}
    const result = await dispatch(hooksMap, { ...BASE_OPTIONS, event: 'PreCompact' })
    expect(result).toStrictEqual({
      event: 'PreCompact',
      vendor: 'claude',
      hooks: [],
    })
  })

  it('dispatches every managed continuity lifecycle hook command', async () => {
    const hooksMap: HooksMap = {
      SessionStart: [
        { hooks: [{ type: 'command', command: 'node /pkg/bin/wp hook sessionstart-routing # wp-sessionstart-routing' }] },
      ],
      PostToolUse: [{ hooks: [{ type: 'command', command: 'node /pkg/bin/wp hook post-tool # wp-post-tool' }] }],
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: 'node /pkg/bin/wp hook guard-switch # wp-guard-switch' }] },
      ],
      Stop: [{ hooks: [{ type: 'command', command: 'node /pkg/bin/wp hook stop-qa # wp-stop-qa' }] }],
      PreCompact: [
        { hooks: [{ type: 'command', command: 'node /pkg/bin/wp hook precompact-snapshot # wp-precompact-snapshot' }] },
      ],
    }

    await expect(
      Promise.all(
        [
          ['SessionStart', 'wp-sessionstart-routing'],
          ['PostToolUse', 'wp-post-tool'],
          ['UserPromptSubmit', 'wp-guard-switch'],
          ['Stop', 'wp-stop-qa'],
          ['PreCompact', 'wp-precompact-snapshot'],
        ].map(async ([event, command]) => {
          const result = await dispatch(hooksMap, { ...BASE_OPTIONS, event })
          return result.hooks.some((hook) => hook.command.includes(command))
        }),
      ),
    ).resolves.toStrictEqual([true, true, true, true, true])
  })
})
