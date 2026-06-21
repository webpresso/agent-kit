import { describe, expect, it } from 'vitest'

import type { CodexAppServerApi, CommandHookMetadata, HooksListResponse } from '#codex/app-server/types.js'
import { syncCodexHookTrustWithAppServer } from './codex-trust-sync.js'

const REPO_ROOT = '/repo'
const HOOKS_PATH = '/repo/.codex/hooks.json'
const CONFIG_FILE = '/fake/.codex/config.toml'

const ownedHook: CommandHookMetadata = {
  key: `${HOOKS_PATH}:pre_tool_use:0:0`,
  eventName: 'pre_tool_use',
  handlerType: 'command',
  matcher: 'Bash',
  command: 'node /pkg/bin/wp hook pretool-guard # wp-pretool-guard',
  timeoutSec: 5,
  statusMessage: null,
  sourcePath: HOOKS_PATH,
  source: 'project',
  pluginId: null,
  displayOrder: 0,
  enabled: true,
  isManaged: false,
  currentHash: 'sha256:abc123',
  trustStatus: 'untrusted',
}

function hooksListResponse(hooks: readonly CommandHookMetadata[]): HooksListResponse {
  return {
    data: [{ cwd: REPO_ROOT, hooks: [...hooks], warnings: [], errors: [] }],
  }
}

class FakeApi implements CodexAppServerApi {
  readonly hooksListCalls: string[][] = []
  readonly batchWrites: unknown[] = []

  constructor(private readonly responses: readonly HooksListResponse[]) {}

  async hooksList(cwds: string[]): Promise<HooksListResponse> {
    this.hooksListCalls.push(cwds)
    const response = this.responses[this.hooksListCalls.length - 1]
    if (!response) {
      throw new Error('unexpected hooks/list call')
    }
    return response
  }

  async configBatchWrite(params: unknown): Promise<{}> {
    this.batchWrites.push(params)
    return {}
  }

  close(): void {}
}

describe('syncCodexHookTrustWithAppServer', () => {
  it('uses hooks/list metadata to write hooks.state entries to config.toml (not hooks.json) and verifies trust', async () => {
    const api = new FakeApi([
      hooksListResponse([ownedHook]),
      hooksListResponse([{ ...ownedHook, trustStatus: 'trusted' }]),
    ])

    const result = await syncCodexHookTrustWithAppServer(api, {
      repoRoot: REPO_ROOT,
      codexConfigFilePath: CONFIG_FILE,
    })

    expect(result).toStrictEqual({
      ok: true,
      trustedKeys: [ownedHook.key],
      state: {
        [ownedHook.key]: { enabled: true, trusted_hash: 'sha256:abc123' },
      },
    })
    expect(api.hooksListCalls).toStrictEqual([[REPO_ROOT], [REPO_ROOT]])
    // filePath must point to config.toml — writing to hooks.json via 'hooks.state' keyPath
    // causes Codex's deny_unknown_fields HooksFile parser to reject hooks.json entirely.
    expect(api.batchWrites).toStrictEqual([
      {
        edits: [
          {
            keyPath: 'hooks.state',
            value: {
              [ownedHook.key]: { enabled: true, trusted_hash: 'sha256:abc123' },
            },
            mergeStrategy: 'upsert',
          },
        ],
        filePath: CONFIG_FILE,
        reloadUserConfig: true,
      },
    ])
  })

  it('ignores non-owned hooks and returns a structured failure when nothing is eligible', async () => {
    const api = new FakeApi([
      hooksListResponse([
        {
          ...ownedHook,
          command: 'python hooks.py',
        },
      ]),
    ])

    const result = await syncCodexHookTrustWithAppServer(api, { repoRoot: REPO_ROOT })

    expect(result).toStrictEqual({
      ok: false,
      reason: 'no-webpresso-hooks-found',
      message: `No webpresso-owned Codex hooks found for ${REPO_ROOT}`,
    })
    expect(api.batchWrites).toStrictEqual([])
  })

  it('returns a structured verification failure when a second hooks/list shows untrusted or disabled hooks', async () => {
    const api = new FakeApi([
      hooksListResponse([ownedHook]),
      hooksListResponse([{ ...ownedHook, trustStatus: 'modified', enabled: false }]),
    ])

    const result = await syncCodexHookTrustWithAppServer(api, { repoRoot: REPO_ROOT })

    expect(result).toStrictEqual({
      ok: false,
      reason: 'verification-failed',
      message: `Hook ${ownedHook.key} remained modified enabled=false after trust sync`,
    })
    expect(api.batchWrites).toHaveLength(1)
  })
})
