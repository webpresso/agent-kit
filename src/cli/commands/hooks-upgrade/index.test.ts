import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { writeHooksManifest } from '#cli/commands/init/scaffolders/agent-hooks/manifest.js'

import { hooksUpgradeCommand, upgradeHooksForRepo } from './index.js'

function makeRepo(name: string): string {
  const repoRoot = mkdtempSync(path.join(tmpdir(), `${name}-`))
  mkdirSync(path.join(repoRoot, '.claude'), { recursive: true })
  mkdirSync(path.join(repoRoot, '.codex'), { recursive: true })
  return repoRoot
}

function writeInstalledHooks(repoRoot: string): void {
  writeFileSync(
    path.join(repoRoot, '.claude', 'settings.json'),
    JSON.stringify(
      {
        hooks: {
          SessionStart: [
            {
              hooks: [{ type: 'command', command: './node_modules/.bin/wp-sessionstart-routing' }],
            },
          ],
        },
      },
      null,
      2,
    ),
  )
  writeFileSync(
    path.join(repoRoot, '.codex', 'hooks.json'),
    JSON.stringify(
      {
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: path.join(repoRoot, '.codex/managed-hooks/wp-sessionstart-routing.sh'),
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
}

describe('upgradeHooksForRepo', () => {
  it('reports a missing manifest as a bounded warning instead of writing blindly', async () => {
    const repoRoot = makeRepo('hooks-upgrade-no-manifest')
    const report = await upgradeHooksForRepo(repoRoot, { apply: false, trustCodexHooks: false })
    expect(report.beforeSummary).toBe('manifest-missing')
    expect(report.warnings[0]).toContain('run `wp setup`')
  })

  it('keeps disabled vendors disabled in the projected summary', async () => {
    const repoRoot = makeRepo('hooks-upgrade-disabled')
    writeInstalledHooks(repoRoot)
    writeHooksManifest(
      repoRoot,
      {
        SessionStart: [
          { hooks: [{ type: 'command', command: './node_modules/.bin/wp-sessionstart-routing' }] },
        ],
      },
      {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: path.join(repoRoot, '.codex/managed-hooks/wp-sessionstart-routing.sh'),
              },
            ],
          },
        ],
      },
      { claude: 'enabled', codex: 'disabled' },
    )

    const report = await upgradeHooksForRepo(repoRoot, { apply: false, trustCodexHooks: false })
    expect(report.projectedSummary).toContain('codex[')
    expect(report.projectedSummary).toContain('disabled')
  })
})

describe('hooksUpgradeCommand', () => {
  it('iterates across workspace repos in dry-run mode by default', async () => {
    const repoA = makeRepo('hooks-upgrade-workspace-a')
    const repoB = makeRepo('hooks-upgrade-workspace-b')
    writeInstalledHooks(repoA)
    writeInstalledHooks(repoB)
    writeHooksManifest(repoA, {}, {}, { claude: 'enabled', codex: 'enabled' })
    writeHooksManifest(repoB, {}, {}, { claude: 'enabled', codex: 'enabled' })

    let output = ''
    const exitCode = await hooksUpgradeCommand(['--workspace'], {
      cwd: repoA,
      workspaceRepos: [repoA, repoB],
      trustCodexHooks: false,
      stdout: { write: (chunk) => ((output += String(chunk)), true) },
    })

    expect(exitCode).toBe(0)
    expect(output).toContain(repoA)
    expect(output).toContain(repoB)
    expect(output).toContain('dry-run')
  })
})
