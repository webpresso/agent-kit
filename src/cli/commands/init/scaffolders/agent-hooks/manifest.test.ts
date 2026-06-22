import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { HooksMap } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'
import {
  diffHooksManifest,
  readHooksManifest,
  withHookVendorState,
  writeHooksManifest,
} from '#cli/commands/init/scaffolders/agent-hooks/manifest.js'

function makeTempDir(): string {
  const dir = join(tmpdir(), `manifest-test-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

const sampleClaudeMap: HooksMap = {
  SessionStart: [
    {
      hooks: [
        { type: 'command', command: 'node_modules/.bin/wp-sessionstart-routing', timeout: 5 },
      ],
    },
  ],
  PreToolUse: [
    {
      matcher: 'Bash(*)',
      hooks: [{ type: 'command', command: 'node_modules/.bin/wp-pretool-guard', timeout: 5 }],
    },
  ],
}

const sampleCodexMap: HooksMap = {
  SessionStart: [
    {
      hooks: [
        { type: 'command', command: '/repo/node_modules/.bin/wp-sessionstart-routing', timeout: 5 },
      ],
    },
  ],
}

describe('manifest', () => {
  describe('writeHooksManifest / readHooksManifest round-trip', () => {
    it('writes and reads back an equivalent manifest', () => {
      const dir = makeTempDir()
      try {
        writeHooksManifest(dir, sampleClaudeMap, sampleCodexMap)
        const result = readHooksManifest(dir)

        expect(result).not.toBeNull()
        expect(result?.version).toStrictEqual(1)
        expect(typeof result?.generatedAt).toStrictEqual('string')
        expect(result?.claude).toStrictEqual(sampleClaudeMap)
        expect(result?.codex).toStrictEqual(sampleCodexMap)
        expect(result?.vendorState).toStrictEqual({ claude: 'enabled', codex: 'enabled' })
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('creates .webpresso/ directory if it does not exist', () => {
      const dir = makeTempDir()
      try {
        // dir exists but .webpresso/ does not
        writeHooksManifest(dir, sampleClaudeMap, sampleCodexMap)
        const result = readHooksManifest(dir)
        expect(result?.version).toStrictEqual(1)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  describe('readHooksManifest', () => {
    it('returns null when the manifest file does not exist', () => {
      const dir = makeTempDir()
      try {
        const result = readHooksManifest(dir)
        expect(result).toBeNull()
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  describe('diffHooksManifest', () => {
    it('returns ok verdict when a hook is in the manifest and installed', () => {
      const manifest = {
        version: 1 as const,
        generatedAt: new Date().toISOString(),
        claude: sampleClaudeMap,
        codex: {} as HooksMap,
        vendorState: { claude: 'enabled', codex: 'enabled' } as const,
      }
      const current = { claude: sampleClaudeMap, codex: {} as HooksMap }

      const diffs = diffHooksManifest(manifest, current)
      const verdicts = diffs.map((d) => d.verdict)
      expect(verdicts.every((v) => v === 'ok')).toStrictEqual(true)
    })

    it('matches setup-injected Vite Plus PATH-prefixed hook commands', () => {
      const manifest = {
        version: 1 as const,
        generatedAt: new Date().toISOString(),
        claude: sampleClaudeMap,
        codex: {} as HooksMap,
        vendorState: { claude: 'enabled', codex: 'enabled' } as const,
      }
      const current = {
        claude: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command:
                    'export PATH="$HOME/.vite-plus/bin:$PATH"; node_modules/.bin/wp-sessionstart-routing',
                  timeout: 5,
                },
              ],
            },
          ],
          PreToolUse: [
            {
              matcher: 'Bash(*)',
              hooks: [
                {
                  type: 'command',
                  command:
                    'export PATH="$HOME/.vite-plus/bin:$PATH"; node_modules/.bin/wp-pretool-guard',
                  timeout: 5,
                },
              ],
            },
          ],
        } as HooksMap,
        codex: {} as HooksMap,
      }

      const diffs = diffHooksManifest(manifest, current)
      expect(diffs.map((d) => d.verdict)).toStrictEqual(['ok', 'ok'])
    })

    it('returns missing verdict when a hook is in the manifest but not installed', () => {
      const manifest = {
        version: 1 as const,
        generatedAt: new Date().toISOString(),
        claude: sampleClaudeMap,
        codex: {} as HooksMap,
        vendorState: { claude: 'enabled', codex: 'enabled' } as const,
      }
      // Empty current — nothing installed
      const current = { claude: {} as HooksMap, codex: {} as HooksMap }

      const diffs = diffHooksManifest(manifest, current)
      expect(diffs.length).toStrictEqual(2)
      expect(diffs.every((d) => d.verdict === 'missing')).toStrictEqual(true)
    })

    it('returns unknown verdict when a hook is installed but not in the manifest', () => {
      const extraMap: HooksMap = {
        Stop: [
          { hooks: [{ type: 'command', command: 'node_modules/.bin/wp-stop-qa', timeout: 10 }] },
        ],
      }
      const manifest = {
        version: 1 as const,
        generatedAt: new Date().toISOString(),
        claude: {} as HooksMap,
        codex: {} as HooksMap,
        vendorState: { claude: 'enabled', codex: 'enabled' } as const,
      }
      const current = { claude: extraMap, codex: {} as HooksMap }

      const diffs = diffHooksManifest(manifest, current)
      expect(diffs.length).toStrictEqual(1)
      expect(diffs[0]?.verdict).toStrictEqual('unknown')
      expect(diffs[0]?.vendor).toStrictEqual('claude')
      expect(diffs[0]?.event).toStrictEqual('Stop')
    })

    it('ignores non-webpresso third-party hook commands that are not in the manifest', () => {
      const extraMap: HooksMap = {
        PreToolUse: [
          {
            hooks: [
              { type: 'command', command: '$CLAUDE_PROJECT_DIR/.claude/hooks/check-gstack.sh' },
              {
                type: 'command',
                command: '/repo/.codex/managed-hooks/wp-global-codex-omx-hook.sh',
              },
            ],
          },
        ],
      }
      const manifest = {
        version: 1 as const,
        generatedAt: new Date().toISOString(),
        claude: {} as HooksMap,
        codex: {} as HooksMap,
        vendorState: { claude: 'enabled', codex: 'enabled' } as const,
      }
      const current = { claude: extraMap, codex: {} as HooksMap }

      expect(diffHooksManifest(manifest, current)).toStrictEqual([])
    })

    it('still reports legacy direct wp hook subcommands as unknown managed hooks', () => {
      const extraMap: HooksMap = {
        PreToolUse: [{ hooks: [{ type: 'command', command: 'wp hook pretool-guard' }] }],
      }
      const manifest = {
        version: 1 as const,
        generatedAt: new Date().toISOString(),
        claude: {} as HooksMap,
        codex: {} as HooksMap,
        vendorState: { claude: 'enabled', codex: 'enabled' } as const,
      }
      const current = { claude: extraMap, codex: {} as HooksMap }

      const diffs = diffHooksManifest(manifest, current)
      expect(diffs).toHaveLength(1)
      expect(diffs[0]).toMatchObject({
        event: 'PreToolUse',
        command: 'wp hook pretool-guard',
        verdict: 'unknown',
        vendor: 'claude',
      })
    })

    it('mixes ok/missing/unknown in a single diff result', () => {
      const manifestClaudeMap: HooksMap = {
        SessionStart: [
          {
            hooks: [
              { type: 'command', command: 'node_modules/.bin/wp-sessionstart-routing', timeout: 5 },
            ],
          },
        ],
        PreToolUse: [
          {
            hooks: [{ type: 'command', command: 'node_modules/.bin/wp-pretool-guard', timeout: 5 }],
          },
        ],
      }
      const currentClaudeMap: HooksMap = {
        // SessionStart present (ok), PreToolUse absent (missing), Stop added (unknown)
        SessionStart: [
          {
            hooks: [
              { type: 'command', command: 'node_modules/.bin/wp-sessionstart-routing', timeout: 5 },
            ],
          },
        ],
        Stop: [
          { hooks: [{ type: 'command', command: 'node_modules/.bin/wp-stop-qa', timeout: 10 }] },
        ],
      }
      const manifest = {
        version: 1 as const,
        generatedAt: new Date().toISOString(),
        claude: manifestClaudeMap,
        codex: {} as HooksMap,
        vendorState: { claude: 'enabled', codex: 'enabled' } as const,
      }
      const current = { claude: currentClaudeMap, codex: {} as HooksMap }

      const diffs = diffHooksManifest(manifest, current)
      const byVerdict = Object.fromEntries(
        ['ok', 'missing', 'unknown'].map((v) => [v, diffs.filter((d) => d.verdict === v).length]),
      )
      expect(byVerdict['ok']).toStrictEqual(1)
      expect(byVerdict['missing']).toStrictEqual(1)
      expect(byVerdict['unknown']).toStrictEqual(1)
    })

    it('suppresses missing diffs for intentionally disabled vendors', () => {
      const manifest = withHookVendorState(
        {
          version: 1,
          generatedAt: new Date().toISOString(),
          claude: sampleClaudeMap,
          codex: {} as HooksMap,
          vendorState: { claude: 'enabled', codex: 'enabled' },
        },
        ['claude'],
        'disabled',
      )

      const diffs = diffHooksManifest(manifest, { claude: {} as HooksMap, codex: {} as HooksMap })
      expect(diffs).toStrictEqual([])
    })
  })
})
