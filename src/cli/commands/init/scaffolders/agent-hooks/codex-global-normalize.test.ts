import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { existsSync } from 'node:fs'

import {
  defaultManagedCodexHooksDir,
  MANAGED_OMX_JSON_ONLY_GLOBAL_HOOK_BASENAME,
  normalizeGlobalCodexHooksJson,
  normalizeGlobalCodexHooksFile,
  resolveInstalledOmxHookScriptPath,
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

  it('rewrites OMX commands with leading env assignments and absolute node paths', () => {
    const hooks = {
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command:
                  'OMX_ROOT="/repo" "/Users/test/.vite-plus/js_runtime/node/24.16.0/bin/node" "/Users/test/.vite-plus/packages/oh-my-codex/lib/node_modules/oh-my-codex/dist/scripts/codex-native-hook.js"',
              },
            ],
          },
        ],
      },
    }

    const result = normalizeGlobalCodexHooksJson(hooks, { nodeBinary: '/abs/node' }, '/managed')
    const commands =
      ((result.value.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>).Stop ??
        [])[0]?.hooks ?? []

    expect(result.changed).toBe(true)
    expect(commands[0]?.command).toBe('"/managed/wp-global-codex-omx-json-hook.sh"')
  })

  it('deduplicates overlapping managed OMX PreToolUse launchers after normalization', () => {
    const hooks = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              {
                type: 'command',
                command: '"/managed/wp-global-codex-omx-hook.sh"',
              },
            ],
          },
          {
            hooks: [
              {
                type: 'command',
                command: '"/managed/wp-global-codex-omx-hook.sh"',
              },
            ],
          },
        ],
      },
    }

    const result = normalizeGlobalCodexHooksJson(hooks, { nodeBinary: '/abs/node' }, '/managed')
    const groups = (result.value.hooks as Record<string, Array<{ matcher?: string }>>).PreToolUse

    expect(result.changed).toBe(true)
    expect(groups).toStrictEqual([
      {
        hooks: [
          {
            type: 'command',
            command: '"/managed/wp-global-codex-omx-hook.sh"',
          },
        ],
      },
    ])
  })

  it('keeps overlapping non-managed PreToolUse hook matchers untouched', () => {
    const hooks = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              {
                type: 'command',
                command: '"/custom/pretool-hook.sh"',
              },
            ],
          },
          {
            hooks: [
              {
                type: 'command',
                command: '"/custom/pretool-hook.sh"',
              },
            ],
          },
        ],
      },
    }

    const result = normalizeGlobalCodexHooksJson(hooks, { nodeBinary: '/abs/node' }, '/managed')

    expect(result.changed).toBe(false)
    expect(result.value).toStrictEqual(hooks)
  })

  it('is idempotent on already normalized hooks', () => {
    const hooks = {
      hooks: {
        PostToolUse: [
          {
            hooks: [
              {
                type: 'command',
              },
            ],
          },
        ],
      },
    }

    const result = normalizeGlobalCodexHooksJson(
      hooks,
      {
        nodeBinary: '/abs/node',
      },
      '/managed',
    )

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
      nodeBinary: '/abs/node',
    })
    const managedDir = defaultManagedCodexHooksDir(hooksPath)

    expect(result.action).toBe('overwritten')
    expect(
      readFileSync(path.join(managedDir, MANAGED_OMX_JSON_ONLY_GLOBAL_HOOK_BASENAME), 'utf8'),
    ).toBe(
      '#!/bin/sh\n' +
        'NODE_BINARY="/abs/node"\n' +
        'HOOK_SCRIPT="/tmp/oh-my-codex/dist/scripts/codex-native-hook.js"\n' +
        '\n' +
        'if [ ! -x "$NODE_BINARY" ]; then\n' +
        '  NODE_BINARY="$(command -v node 2>/dev/null || true)"\n' +
        'fi\n' +
        '\n' +
        'if [ -z "$NODE_BINARY" ] || [ ! -x "$NODE_BINARY" ]; then\n' +
        '  echo "OMX Codex hook skipped: node runtime not found; rerun omx setup or wp setup" >&2\n' +
        "  printf '%s\\n' '{}'\n" +
        '  exit 0\n' +
        'fi\n' +
        '\n' +
        'if [ ! -f "$HOOK_SCRIPT" ]; then\n' +
        '  echo "OMX Codex hook skipped: hook script not found; rerun omx setup or wp setup" >&2\n' +
        "  printf '%s\\n' '{}'\n" +
        '  exit 0\n' +
        'fi\n' +
        '\n' +
        '"$NODE_BINARY" "$HOOK_SCRIPT" "$@" >/dev/null\n' +
        'status=$?\n' +
        'if [ "$status" -ne 0 ]; then\n' +
        '  echo "OMX Codex hook exited with status $status" >&2\n' +
        'fi\n' +
        "printf '%s\\n' '{}'\n" +
        'exit 0\n',
    )
  })

  it('shared OMX global launcher emits JSON passthrough when node is missing', () => {
    const root = mkroot('wp-codex-global-missing-node-')
    const hooksPath = path.join(root, 'hooks.json')
    writeFileSync(
      hooksPath,
      JSON.stringify({
        hooks: {
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
      }),
    )

    normalizeGlobalCodexHooksFile(hooksPath, {
      nodeBinary: '/missing/nonexistent-node',
    })

    const launcherPath = path.join(
      defaultManagedCodexHooksDir(hooksPath),
      MANAGED_OMX_JSON_ONLY_GLOBAL_HOOK_BASENAME,
    )
    const result = spawnSync('sh', [launcherPath], {
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toContain('node runtime not found')
    expect(result.stdout).toBe('{}\n')
    expect(() => JSON.parse(result.stdout)).not.toThrow()
  })

  it('shared OMX global launcher emits JSON passthrough when the hook script is missing', () => {
    const root = mkroot('wp-codex-global-missing-script-')
    const hooksPath = path.join(root, 'hooks.json')
    writeFileSync(
      hooksPath,
      JSON.stringify({
        hooks: {
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
      }),
    )

    normalizeGlobalCodexHooksFile(hooksPath, {
      nodeBinary: process.execPath,
    })

    const launcherPath = path.join(
      defaultManagedCodexHooksDir(hooksPath),
      MANAGED_OMX_JSON_ONLY_GLOBAL_HOOK_BASENAME,
    )
    const result = spawnSync('sh', [launcherPath], { encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(result.stderr).toContain('hook script not found')
    expect(result.stdout).toBe('{}\n')
    expect(() => JSON.parse(result.stdout)).not.toThrow()
  })

  it('refreshes an already-normalized OMX launcher when setup knows the current hook script path', () => {
    const root = mkroot('wp-codex-global-managed-refresh-')
    const hooksPath = path.join(root, 'hooks.json')
    const managedDir = defaultManagedCodexHooksDir(hooksPath)
    mkdirSync(managedDir, { recursive: true })

    writeFileSync(
      hooksPath,
      JSON.stringify(
        {
          hooks: {
            Stop: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: `"${path.join(managedDir, 'wp-global-codex-omx-hook.sh')}"`,
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
    writeFileSync(
      path.join(managedDir, MANAGED_OMX_JSON_ONLY_GLOBAL_HOOK_BASENAME),
      '#!/bin/sh\nexec "/stale/node" "/stale/codex-native-hook.js" "$@"\n',
      'utf8',
    )

    const result = normalizeGlobalCodexHooksFile(hooksPath, {
      nodeBinary: '/abs/node',
      omxScriptPath: '/stable/oh-my-codex/dist/scripts/codex-native-hook.js',
    })

    expect(result.action).toBe('overwritten')
    const normalizedHooks = JSON.parse(readFileSync(hooksPath, 'utf8')) as {
      hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> }
    }
    expect(normalizedHooks.hooks.Stop[0]?.hooks[0]?.command).toBe(
      `"${path.join(managedDir, MANAGED_OMX_JSON_ONLY_GLOBAL_HOOK_BASENAME)}"`,
    )
    const rewritten = readFileSync(
      path.join(managedDir, MANAGED_OMX_JSON_ONLY_GLOBAL_HOOK_BASENAME),
      'utf8',
    )
    expect(rewritten).toContain('NODE_BINARY="/abs/node"')
    expect(rewritten).toContain(
      'HOOK_SCRIPT="/stable/oh-my-codex/dist/scripts/codex-native-hook.js"',
    )
    expect(rewritten).toContain(`printf '%s\\n' '{}'`)
  })

  it('json-only OMX launcher swallows invalid stdout and emits valid JSON for Stop', () => {
    const root = mkroot('wp-codex-global-stop-json-')
    const hooksPath = path.join(root, 'hooks.json')
    const hookScript = path.join(root, 'codex-native-hook.js')
    writeFileSync(hookScript, '#!/usr/bin/env node\nprocess.stdout.write("not-json\\n")\n', 'utf8')
    writeFileSync(
      hooksPath,
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [{ type: 'command', command: `node "${hookScript}"` }],
            },
          ],
        },
      }),
    )

    normalizeGlobalCodexHooksFile(hooksPath, {
      nodeBinary: process.execPath,
    })

    const launcherPath = path.join(
      defaultManagedCodexHooksDir(hooksPath),
      MANAGED_OMX_JSON_ONLY_GLOBAL_HOOK_BASENAME,
    )
    const result = spawnSync('sh', [launcherPath], { encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('{}\n')
    expect(() => JSON.parse(result.stdout)).not.toThrow()
    expect(result.stdout).not.toContain('not-json')
  })

  it('non-json-only OMX launcher still proxies stdout for non-Stop events', () => {
    const root = mkroot('wp-codex-global-posttooluse-stdout-')
    const hooksPath = path.join(root, 'hooks.json')
    const hookScript = path.join(root, 'codex-native-hook.js')
    writeFileSync(
      hookScript,
      '#!/usr/bin/env node\nprocess.stdout.write("raw-post-tool-output\\n")\n',
      'utf8',
    )
    writeFileSync(
      hooksPath,
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              hooks: [{ type: 'command', command: `node "${hookScript}"` }],
            },
          ],
        },
      }),
    )

    normalizeGlobalCodexHooksFile(hooksPath, {
      nodeBinary: process.execPath,
    })

    const launcherPath = path.join(
      defaultManagedCodexHooksDir(hooksPath),
      'wp-global-codex-omx-hook.sh',
    )
    const result = spawnSync('sh', [launcherPath], { encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('raw-post-tool-output\n')
  })
})

describe('normalizeGlobalCodexHooksFile — absent file behavior', () => {
  it('returns identical and does not create the file when no hook launcher seed is available', () => {
    const root = mkroot('wp-codex-global-no-seed-')
    const hooksPath = path.join(root, 'hooks.json')

    const result = normalizeGlobalCodexHooksFile(hooksPath, {})

    expect(result.action).toBe('identical')
    expect(existsSync(hooksPath)).toBe(false)
  })
})

describe('resolveBinaryOnPath', () => {
  it('finds an executable on PATH', () => {
    const root = mkroot('wp-codex-global-bin-')
    const binDir = path.join(root, 'bin')
    mkdirSync(binDir, { recursive: true })
    const candidate = path.join(binDir, 'demo-binary')
    writeFileSync(candidate, '#!/bin/sh\nexit 0\n', { mode: 0o755 })

    expect(resolveBinaryOnPath('demo-binary', binDir)).toBe(candidate)
  })

  it('returns null when the binary is absent', () => {
    expect(resolveBinaryOnPath('missing-binary', '/tmp/does-not-exist')).toBeNull()
  })
})

describe('resolveInstalledOmxHookScriptPath', () => {
  it('prefers the stable Vite+ package-store hook path when present', () => {
    const root = mkroot('wp-omx-script-stable-')
    const candidate = path.join(
      root,
      '.vite-plus',
      'packages',
      'oh-my-codex',
      'lib',
      'node_modules',
      'oh-my-codex',
      'dist',
      'scripts',
      'codex-native-hook.js',
    )
    mkdirSync(path.dirname(candidate), { recursive: true })
    writeFileSync(candidate, '// hook\n', 'utf8')

    expect(resolveInstalledOmxHookScriptPath(root)).toBe(candidate)
  })

  it('falls back to the newest legacy js_runtime install when needed', () => {
    const root = mkroot('wp-omx-script-legacy-')
    const legacyA = path.join(
      root,
      '.vite-plus',
      'js_runtime',
      'node',
      '24.15.0',
      'lib',
      'node_modules',
      'oh-my-codex',
      'dist',
      'scripts',
      'codex-native-hook.js',
    )
    const legacyB = path.join(
      root,
      '.vite-plus',
      'js_runtime',
      'node',
      '24.16.0',
      'lib',
      'node_modules',
      'oh-my-codex',
      'dist',
      'scripts',
      'codex-native-hook.js',
    )
    mkdirSync(path.dirname(legacyA), { recursive: true })
    mkdirSync(path.dirname(legacyB), { recursive: true })
    writeFileSync(legacyA, '// hook a\n', 'utf8')
    writeFileSync(legacyB, '// hook b\n', 'utf8')

    expect(resolveInstalledOmxHookScriptPath(root)).toBe(legacyB)
  })
})
