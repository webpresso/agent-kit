import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  defaultManagedCodexHooksDir,
  normalizeGlobalCodexHooksJson,
  normalizeGlobalCodexHooksFile,
  resolveBinaryOnPath,
} from './codex-global-normalize.js'

const cleanups: string[] = []

afterEach(() => {
  while (cleanups.length > 0) {
    const dir = cleanups.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function mkroot(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  cleanups.push(dir)
  return dir
}

describe('normalizeGlobalCodexHooksJson', () => {
  it('rewrites bare context-mode commands to managed launcher commands and dedupes identical groups', () => {
    const hooks = {
      hooks: {
        PostToolUse: [
          {
            matcher: '',
            hooks: [{ type: 'command', command: 'context-mode hook codex posttooluse' }],
          },
          {
            hooks: [{ type: 'command', command: 'context-mode hook codex posttooluse' }],
          },
        ],
      },
    }

    const result = normalizeGlobalCodexHooksJson(hooks, {
      contextModeBinary: '/abs/context-mode',
    }, '/managed')

    expect(result.changed).toBe(true)
    expect(result.value.hooks).toStrictEqual({
      PostToolUse: [
        {
          matcher: '',
          hooks: [{ type: 'command', command: '"/managed/wp-global-codex-context-mode-posttooluse.sh"' }],
        },
      ],
    })
  })

  it('rewrites bare node codex-native-hook commands to managed launcher commands', () => {
    const hooks = {
      hooks: {
        PostToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node "/tmp/oh-my-codex/dist/scripts/codex-native-hook.js"',
              },
            ],
          },
        ],
      },
    }

    const result = normalizeGlobalCodexHooksJson(hooks, { nodeBinary: '/abs/node' }, '/managed')
    const commands =
      ((result.value.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>)
        .PostToolUse ?? [])[0]?.hooks ?? []

    expect(result.changed).toBe(true)
    expect(commands[0]?.command).toBe('"/managed/wp-global-codex-omx-hook.sh"')
  })

  it('is idempotent on already normalized hooks', () => {
    const hooks = {
      hooks: {
        PostToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: '"/managed/wp-global-codex-context-mode-posttooluse.sh"',
              },
            ],
          },
        ],
      },
    }

    const result = normalizeGlobalCodexHooksJson(hooks, {
      contextModeBinary: '/abs/context-mode',
      nodeBinary: '/abs/node',
    }, '/managed')

    expect(result.changed).toBe(false)
    expect(result.value).toStrictEqual(hooks)
  })

  it('writes managed launcher scripts next to the Codex home hooks file', () => {
    const root = mkroot('wp-codex-global-managed-')
    const hooksPath = path.join(root, 'hooks.json')
    writeFileSync(
      hooksPath,
      JSON.stringify(
        {
          hooks: {
            PostToolUse: [{ hooks: [{ type: 'command', command: 'context-mode hook codex posttooluse' }] }],
            Stop: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: 'node "/tmp/oh-my-codex/dist/scripts/codex-native-hook.js"',
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    )

    const result = normalizeGlobalCodexHooksFile(hooksPath, {
      contextModeBinary: '/abs/context-mode',
      nodeBinary: '/abs/node',
    })
    const managedDir = defaultManagedCodexHooksDir(hooksPath)

    expect(result.action).toBe('overwritten')
    expect(readFileSync(path.join(managedDir, 'wp-global-codex-context-mode-posttooluse.sh'), 'utf8'))
      .toBe('#!/bin/sh\nexec "/abs/context-mode" hook codex posttooluse "$@"\n')
    expect(readFileSync(path.join(managedDir, 'wp-global-codex-omx-hook.sh'), 'utf8')).toBe(
      '#!/bin/sh\nexec "/abs/node" "/tmp/oh-my-codex/dist/scripts/codex-native-hook.js" "$@"\n',
    )
  })
})

describe('resolveBinaryOnPath', () => {
  it('finds an executable on PATH', () => {
    const root = mkroot('wp-codex-global-bin-')
    const binDir = path.join(root, 'bin')
    mkdirSync(binDir, { recursive: true })
    const candidate = path.join(binDir, 'context-mode')
    writeFileSync(candidate, '#!/bin/sh\nexit 0\n', { mode: 0o755 })

    expect(resolveBinaryOnPath('context-mode', binDir)).toBe(candidate)
  })

  it('returns null when the binary is absent', () => {
    expect(resolveBinaryOnPath('missing-binary', '/tmp/does-not-exist')).toBeNull()
  })
})
