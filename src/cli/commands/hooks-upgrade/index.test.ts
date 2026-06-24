import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { writeHooksManifest } from '#cli/commands/init/scaffolders/agent-hooks/manifest.js'

import { hooksUpgradeCommand, upgradeHooksForRepo } from './index.js'

const createdDirs: string[] = []

function makeRepo(name: string): string {
  const repoRoot = mkdtempSync(path.join(tmpdir(), `${name}-`))
  createdDirs.push(repoRoot)
  mkdirSync(path.join(repoRoot, '.claude'), { recursive: true })
  mkdirSync(path.join(repoRoot, '.codex'), { recursive: true })
  return repoRoot
}

beforeEach(() => {
  createdDirs.length = 0
})

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function writeInstalledHooks(repoRoot: string): void {
  writeFileSync(
    path.join(repoRoot, '.claude', 'settings.json'),
    JSON.stringify(
      {
        hooks: {
          SessionStart: [
            {
              hooks: [{ type: 'command', command: 'wp hook sessionstart-routing' }],
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
                  command: `/usr/bin/node /pkg/bin/wp hook sessionstart-routing # wp-sessionstart-routing`,
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
  it('bootstraps legacy/no-manifest repos in dry-run mode instead of bailing out', async () => {
    const repoRoot = makeRepo('hooks-upgrade-no-manifest')
    writeInstalledHooks(repoRoot)
    const report = await upgradeHooksForRepo(repoRoot, { apply: false, trustCodexHooks: false })
    expect(report.beforeSummary).toBe('legacy/no-manifest')
    expect(report.results.length).toBeGreaterThan(0)
    expect(report.warnings).toContain(
      'bootstrapping from legacy/no-manifest hook state using the current scaffolder contract',
    )
  })

  it('creates a fresh manifest and rewrites legacy wrapper commands on apply when the manifest is missing', async () => {
    const repoRoot = makeRepo('hooks-upgrade-apply-no-manifest')
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
                    command: `if [ -x '${repoRoot}/.codex/managed-hooks/wp-sessionstart-routing.sh' ]; then '${repoRoot}/.codex/managed-hooks/wp-sessionstart-routing.sh'; else true; fi`,
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
      path.join(repoRoot, '.claude', 'settings.json'),
      JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                hooks: [
                  {
                    type: 'command',
                    command:
                      '[ -x "$CLAUDE_PROJECT_DIR/.claude/hooks/managed/wp-sessionstart-routing.sh" ] && "$CLAUDE_PROJECT_DIR/.claude/hooks/managed/wp-sessionstart-routing.sh" || true',
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
    mkdirSync(path.join(repoRoot, 'src', 'cli'), { recursive: true })
    writeFileSync(path.join(repoRoot, 'src', 'cli', 'cli.ts'), '')

    const report = await upgradeHooksForRepo(repoRoot, { apply: true, trustCodexHooks: false })

    expect(report.beforeSummary).toBe('legacy/no-manifest')
    expect(report.warnings).toContain(
      'bootstrapping from legacy/no-manifest hook state using the current scaffolder contract',
    )
    expect(
      JSON.parse(readFileSync(path.join(repoRoot, '.codex', 'hooks.json'), 'utf8')).hooks
        .SessionStart[0].hooks[0].command,
    ).toContain(' hook sessionstart-routing')
    expect(readFileSync(path.join(repoRoot, '.codex', 'hooks.json'), 'utf8')).not.toContain(
      '/.codex/managed-hooks/',
    )
    expect(readFileSync(path.join(repoRoot, '.claude', 'settings.json'), 'utf8')).not.toContain(
      '/.claude/hooks/managed/',
    )
    expect(
      readFileSync(path.join(repoRoot, '.webpresso', 'hooks-manifest.json'), 'utf8'),
    ).toContain('hook sessionstart-routing')
  })

  it('keeps disabled vendors disabled in the projected summary', async () => {
    const repoRoot = makeRepo('hooks-upgrade-disabled')
    writeInstalledHooks(repoRoot)
    writeHooksManifest(
      repoRoot,
      {
        SessionStart: [{ hooks: [{ type: 'command', command: 'wp hook sessionstart-routing' }] }],
      },
      {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: `/usr/bin/node /pkg/bin/wp hook sessionstart-routing # wp-sessionstart-routing`,
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
