import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  scaffoldAgentHooks,
  trustCodexWebpressoHooksForRepo,
  type CodexTrustSyncWarning,
} from './index.js'

describe('codex app-server trust integration', () => {
  const repos: string[] = []

  afterEach(async () => {
    await Promise.all(
      repos
        .splice(0)
        .map((repoRoot) =>
          import('node:fs/promises').then((fs) =>
            fs.rm(repoRoot, { recursive: true, force: true }),
          ),
        ),
    )
  })

  function tempRepo(): string {
    const repoRoot = mkdtempSync(join(tmpdir(), 'wp-agent-hooks-app-server-'))
    repos.push(repoRoot)
    return repoRoot
  }

  it('does not spawn codex app-server during dry-run', async () => {
    const repoRoot = tempRepo()
    let spawnCount = 0

    await scaffoldAgentHooks({
      repoRoot,
      options: { dryRun: true },
      createCodexAppServer: async () => {
        spawnCount += 1
        throw new Error('should not spawn in dry-run')
      },
    })

    expect(spawnCount).toBe(0)
  })

  it('emits a structured warning and leaves CODEX_HOME untouched when app-server is unavailable', async () => {
    const repoRoot = tempRepo()
    const warnings: CodexTrustSyncWarning[] = []
    const configPath = join(repoRoot, '.codex-home', 'config.toml')
    const previousCodexHome = process.env.CODEX_HOME
    process.env.CODEX_HOME = join(repoRoot, '.codex-home')

    await scaffoldAgentHooks({
      repoRoot,
      options: {},
      createCodexAppServer: async () => {
        throw new Error('codex app-server unavailable')
      },
      onCodexTrustSyncWarning: (warning) => warnings.push(warning),
    })

    expect(warnings).toStrictEqual([
      {
        kind: 'codex-app-server-trust-sync-warning',
        message: 'codex app-server unavailable',
      },
    ])
    expect(existsSync(configPath)).toBe(false)
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME
    else process.env.CODEX_HOME = previousCodexHome
  })

  it('reapplies trust sync through the same app-server-first path after later setup steps', async () => {
    const repoRoot = tempRepo()
    const hooksPath = join(repoRoot, '.codex', 'hooks.json')
    const managedLauncher = join(repoRoot, '.codex', 'managed-hooks', 'wp-pretool-guard.sh')
    const batchWrites: unknown[] = []
    let listCall = 0

    await scaffoldAgentHooks({
      repoRoot,
      options: {},
      createCodexAppServer: async () => ({
        async hooksList() {
          return { data: [{ cwd: repoRoot, hooks: [], warnings: [], errors: [] }] }
        },
        async configBatchWrite() {
          return {}
        },
        close() {},
      }),
    })

    await trustCodexWebpressoHooksForRepo({
      repoRoot,
      options: {},
      createCodexAppServer: async () => ({
        async hooksList(cwds: string[]) {
          listCall += 1
          expect(cwds).toStrictEqual([repoRoot])
          return {
            data: [
              {
                cwd: repoRoot,
                hooks: [
                  {
                    key: `${hooksPath}:pre_tool_use:0:0`,
                    eventName: 'pre_tool_use',
                    handlerType: 'command',
                    matcher: 'Bash',
                    command: managedLauncher,
                    timeoutSec: 5,
                    statusMessage: null,
                    sourcePath: hooksPath,
                    source: 'project',
                    pluginId: null,
                    displayOrder: 0,
                    enabled: true,
                    isManaged: false,
                    currentHash: 'sha256:abc123',
                    trustStatus: listCall === 1 ? 'untrusted' : 'trusted',
                  },
                ],
                warnings: [],
                errors: [],
              },
            ],
          }
        },
        async configBatchWrite(params) {
          batchWrites.push(params)
          return {}
        },
        close() {},
      }),
    })

    expect(batchWrites).toHaveLength(1)
  })
})
