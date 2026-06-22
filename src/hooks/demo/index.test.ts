import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { writeHooksManifest } from '#cli/commands/init/scaffolders/agent-hooks/manifest.js'
import { demoCommand, simulateHookDemo } from '#hooks/demo/index.js'

describe('simulateHookDemo', () => {
  it('marks the managed pretool hook as would-enforce when the tool matches', () => {
    const result = simulateHookDemo({
      vendor: 'claude',
      event: 'PreToolUse',
      tool: 'Bash',
      hooksMap: {
        PreToolUse: [
          {
            matcher: 'Bash|Edit|Write',
            hooks: [
              {
                type: 'command',
                command: 'node /pkg/bin/wp hook pretool-guard # wp-pretool-guard',
              },
            ],
          },
        ],
      },
    })

    expect(result.rows).toStrictEqual([
      {
        hook: 'wp-pretool-guard',
        command: 'node /pkg/bin/wp hook pretool-guard # wp-pretool-guard',
        matcher: 'Bash|Edit|Write',
        verdict: 'would-enforce',
        reason: 'guard-class hook would run for this simulated tool/event',
      },
    ])
  })

  it('marks hooks as skipped-matcher when the simulated tool does not match', () => {
    const result = simulateHookDemo({
      vendor: 'claude',
      event: 'PreToolUse',
      tool: 'Read',
      hooksMap: {
        PreToolUse: [
          {
            matcher: 'Bash|Edit|Write',
            hooks: [
              {
                type: 'command',
                command: 'node /pkg/bin/wp hook pretool-guard # wp-pretool-guard',
              },
            ],
          },
        ],
      },
    })

    expect(result.rows[0]?.verdict).toBe('skipped-matcher')
    expect(result.rows[0]?.reason).toContain('Read')
  })

  it('marks simulated hooks disabled when the vendor is disabled in the manifest', () => {
    const result = simulateHookDemo({
      vendor: 'codex',
      event: 'SessionStart',
      vendorState: 'disabled',
      hooksMap: {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node /pkg/bin/wp hook sessionstart-routing # wp-sessionstart-routing',
              },
            ],
          },
        ],
      },
    })

    expect(result.rows[0]?.verdict).toBe('disabled')
    expect(result.rows[0]?.reason).toContain('explicitly disabled')
  })

  it('accepts extended documented lifecycle events with zero registered hooks', () => {
    const result = simulateHookDemo({
      vendor: 'claude',
      event: 'SessionEnd',
      hooksMap: {},
    })

    expect(result.rows).toStrictEqual([])
  })
})

describe('demoCommand', () => {
  it('prints a pure simulation without mutating hook config files', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'hooks-demo-'))
    mkdirSync(join(repoRoot, '.claude'), { recursive: true })

    const settingsPath = join(repoRoot, '.claude', 'settings.json')
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash|Edit|Write',
            hooks: [
              {
                type: 'command',
                command: 'node /pkg/bin/wp hook pretool-guard # wp-pretool-guard',
                timeout: 5,
              },
            ],
          },
        ],
      },
    }
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    writeHooksManifest(repoRoot, settings.hooks, {}, { claude: 'enabled', codex: 'enabled' })

    const before = readFileSync(settingsPath, 'utf8')
    let output = ''

    await demoCommand(['PreToolUse', '--tool', 'Bash'], {
      cwd: repoRoot,
      env: { CLAUDE_PROJECT_DIR: repoRoot },
      stdout: { write: (chunk) => ((output += String(chunk)), true) },
    })

    const after = readFileSync(settingsPath, 'utf8')
    expect(after).toBe(before)
    expect(output).toContain('simulation only')
    expect(output).toContain('would-enforce')
    expect(output).toContain('wp-pretool-guard')
  })
})
