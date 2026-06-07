import { describe, expect, it, vi } from 'vitest'

import type { HooksMap } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'
import type { HooksManifest } from '#cli/commands/init/scaffolders/agent-hooks/manifest.js'
import {
  generateSetupReport,
  printSetupReport,
} from '#cli/commands/init/scaffolders/agent-hooks/report.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const claudeMap: HooksMap = {
  SessionStart: [
    {
      hooks: [
        { type: 'command', command: 'node_modules/.bin/wp-sessionstart-routing', timeout: 5 },
        { type: 'command', command: 'node_modules/.bin/wp-check-dev-link', timeout: 5 },
      ],
    },
  ],
  PreToolUse: [
    {
      matcher: 'Bash(*)',
      hooks: [{ type: 'command', command: 'node_modules/.bin/wp-pretool-guard', timeout: 5 }],
    },
  ],
  Stop: [
    { hooks: [{ type: 'command', command: 'node_modules/.bin/wp-stop-qa', timeout: 10 }] },
  ],
}

const codexMap: HooksMap = {
  SessionStart: [
    {
      hooks: [
        { type: 'command', command: '/repo/node_modules/.bin/wp-sessionstart-routing', timeout: 5 },
      ],
    },
  ],
  PreToolUse: [
    {
      matcher: 'Bash|apply_patch',
      hooks: [
        { type: 'command', command: '/repo/node_modules/.bin/wp-pretool-guard', timeout: 5 },
      ],
    },
  ],
  Stop: [
    { hooks: [{ type: 'command', command: '/repo/node_modules/.bin/wp-stop-qa', timeout: 10 }] },
  ],
}

function makeManifest(claude: HooksMap, codex: HooksMap): HooksManifest {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    claude,
    codex,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('generateSetupReport', () => {
  it('fresh install (before=null): all hooks show as new (+)', () => {
    const after = makeManifest(claudeMap, codexMap)
    const report = generateSetupReport(null, after)

    expect(report).toContain('Hooks change summary:')
    // All claude hooks are new
    expect(report).toContain('+ wp-sessionstart-routing [SessionStart]')
    expect(report).toContain('+ wp-check-dev-link [SessionStart]')
    expect(report).toContain('+ wp-pretool-guard [PreToolUse]')
    expect(report).toContain('+ wp-stop-qa [Stop]')
    // Summary line shows added count
    expect(report).toContain('added')
  })

  it('re-run with same manifest: no changes shown', () => {
    const manifest = makeManifest(claudeMap, codexMap)
    const report = generateSetupReport(manifest, manifest)

    expect(report).toContain('no changes')
    expect(report).not.toContain('+')
    expect(report).not.toContain('-')
  })

  it('after removing a hook: shows (-) for missing hook', () => {
    const before = makeManifest(claudeMap, codexMap)

    // After map has SessionStart removed from claude
    const claudeWithoutSessionStart: HooksMap = {
      PreToolUse: claudeMap.PreToolUse ?? [],
      Stop: claudeMap.Stop ?? [],
    }
    const after = makeManifest(claudeWithoutSessionStart, codexMap)
    const report = generateSetupReport(before, after)

    expect(report).toContain('- wp-sessionstart-routing [SessionStart]')
    expect(report).toContain('- wp-check-dev-link [SessionStart]')
    expect(report).toContain('removed')
  })

  it('generates a non-empty string', () => {
    const after = makeManifest(claudeMap, codexMap)
    const report = generateSetupReport(null, after)

    expect(typeof report).toStrictEqual('string')
    expect(report.length).toBeGreaterThan(0)
  })

  it('always ends with the wp hooks status hint', () => {
    const after = makeManifest(claudeMap, codexMap)
    const report = generateSetupReport(null, after)

    expect(report).toContain('wp hooks status')
  })
})

describe('printSetupReport', () => {
  it('calls process.stdout.write with the generated report', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      const after = makeManifest(claudeMap, codexMap)
      printSetupReport(null, after)

      expect(writeSpy).toHaveBeenCalledOnce()
      const written = writeSpy.mock.calls[0]?.[0]
      expect(typeof written).toStrictEqual('string')
      expect(String(written)).toContain('Hooks change summary:')
    } finally {
      writeSpy.mockRestore()
    }
  })
})
