/**
 * Generated-command boundary smoke (P2).
 *
 * Unlike the unit suite (which imports routing functions) and runner.test.ts (which
 * spawns dist/esm/...), this scaffolds hooks into a temp repo, extracts the EXACT
 * command that Claude/Codex would invoke from the generated `.claude/settings.json` /
 * `.codex/hooks.json`, runs it with host-shaped stdin from the conformance matrix, and
 * asserts the decision. This is the wire a host actually executes.
 *
 * In this source worktree (no compiled bin/runtime present) the generated `wp hook ...`
 * command falls back to source via bin/_run.js, so this exercises CURRENT source.
 * The compiled-runtime replay of the same matrix is P4.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { scaffoldAgentHooks } from '#cli/commands/init/scaffolders/agent-hooks/index.js'

import { CONFORMANCE_MATRIX, assertConformance, type ConformanceRow } from './matrix.js'

type HostConfig = { readonly hooks: Record<string, Array<{ hooks: Array<{ command?: string }> }>> }

let repoRoot: string
let claudeCommands: readonly string[]
let codexCommands: readonly string[]

function collectCommands(config: HostConfig): string[] {
  const out: string[] = []
  for (const groups of Object.values(config.hooks ?? {})) {
    for (const group of groups) {
      for (const hook of group.hooks ?? []) {
        if (typeof hook.command === 'string') out.push(hook.command)
      }
    }
  }
  return out
}

function subcommandFor(hookBin: string): string {
  return hookBin.replace(/^wp-/u, '')
}

function commandForRow(row: ConformanceRow): string {
  const pool = row.host === 'codex' ? codexCommands : claudeCommands
  const needle = ` hook ${subcommandFor(row.hookBin)}`
  const command = pool.find((c) => c.includes(needle))
  if (!command) {
    throw new Error(`no generated ${row.host} command for ${row.hookBin} (needle "${needle}")`)
  }
  return command
}

function runGenerated(command: string, stdin: string): { stdout: string; exitCode: number | null } {
  const result = spawnSync('sh', ['-c', command], {
    input: stdin,
    encoding: 'utf-8',
    cwd: repoRoot,
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: repoRoot,
      // Keep hooks fast/offline; never block the smoke on update checks.
      WP_SKIP_UPDATE_CHECK: '1',
    },
  })
  return { stdout: result.stdout ?? '', exitCode: result.status }
}

beforeAll(async () => {
  repoRoot = mkdtempSync(join(tmpdir(), 'hook-boundary-smoke-'))
  // Real consumer repos are git repos; hooks resolve the repo root from git. A
  // non-git cwd makes pretool-guard exit non-zero, which Codex's wrapper surfaces as a
  // (misleading) deny — so the fixture must mirror reality.
  spawnSync('git', ['init', '-q'], { cwd: repoRoot })
  await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })
  claudeCommands = collectCommands(
    JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8')) as HostConfig,
  )
  codexCommands = collectCommands(
    JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as HostConfig,
  )
}, 60_000)

afterAll(() => {
  if (repoRoot) rmSync(repoRoot, { recursive: true, force: true })
})

describe('generated-command boundary smoke', () => {
  it('scaffolds both host configs with a pretool-guard command', () => {
    expect(claudeCommands.some((c) => c.includes(' hook pretool-guard'))).toBe(true)
    expect(codexCommands.some((c) => c.includes(' hook pretool-guard'))).toBe(true)
  })

  // One spawned-process assertion per matrix row — the real wire, both hosts.
  for (const row of CONFORMANCE_MATRIX) {
    it(`conforms: ${row.name}`, () => {
      const command = commandForRow(row)
      const result = runGenerated(command, row.stdin)
      expect(() => assertConformance(row, result), `${row.name}\ncmd: ${command}`).not.toThrow()
    }, 30_000)
  }
})
