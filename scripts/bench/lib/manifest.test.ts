import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  captureManifest,
  diffManifest,
  loadManifest,
  resolveWorkspaceIdentitiesFromEnv,
  resolveWorkspaceConfig,
  validateKnownAnthropicWorkspaces,
  validateDistinctWorkspaces,
  validateWorkspaceKeyPresence,
  verifyManifest,
  type Manifest,
} from './manifest'

const LOCK_PATH = join(tmpdir(), 'bench-manifest-test')

function createLockFile(path: string, content: Manifest): void {
  writeFileSync(path, `${JSON.stringify(content, null, 2)}\n`, 'utf8')
}

describe('manifest capture and validation', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(LOCK_PATH)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('loads manifest lock with normalized string fields', () => {
    const lockPath = join(dir, 'manifest.lock.json')
    createLockFile(lockPath, {
      bun: '1.3.13',
      claude: '2.1.146',
      node: 'v20.0.0',
      model: 'claude-sonnet-4-5',
      plugins: {
        main: 'abc',
        v1: 'def',
        v2: '123',
      },
    })

    const loaded = loadManifest(lockPath)

    expect(loaded).toStrictEqual({
      bun: '1.3.13',
      claude: '2.1.146',
      node: 'v20.0.0',
      model: 'claude-sonnet-4-5',
      plugins: {
        main: 'abc',
        v1: 'def',
        v2: '123',
      },
    })
  })

  it('captures manifest fields from injectable runners', async () => {
    const captured = await captureManifest({
      model: 'model-x',
      runCommand: async (_command, args) => {
        if (args[0] === '--version') {
          return `simulated-${args.join(':')}`
        }
        return `command-${args.join('-')}`
      },
      runPluginSha: async (path: string) => `plugin-${path}`,
      pluginDirs: {
        main: '/tmp/main',
        v1: '/tmp/v1',
        v2: '/tmp/v2',
      },
    })

    expect(captured).toStrictEqual({
      bun: 'simulated---version',
      claude: 'simulated---version',
      node: 'simulated---version',
      model: 'model-x',
      plugins: {
        main: 'plugin-/tmp/main',
        v1: 'plugin-/tmp/v1',
        v2: 'plugin-/tmp/v2',
      },
    })
  })

  it('diffManifest enumerates all field-level mismatches', () => {
    const captured: Manifest = {
      bun: '1',
      claude: '2',
      node: '3',
      model: 'x',
      plugins: {
        main: 'a',
        v1: 'b',
        v2: 'c',
      },
    }

    const pinned: Manifest = {
      bun: '1',
      claude: '9',
      node: '3',
      model: 'y',
      plugins: {
        main: 'a',
        v1: 'z',
        v2: 'c',
      },
    }

    expect(diffManifest(captured, pinned)).toEqual([
      'claude: captured=2 pinned=9',
      'model: captured=x pinned=y',
      'plugins.v1: captured=b pinned=z',
    ])
  })

  it('throws with named diff when manifest differs', () => {
    const captured: Manifest = {
      bun: 'a',
      claude: 'b',
      node: 'c',
      model: 'd',
      plugins: {
        main: '1',
        v1: '2',
        v2: '3',
      },
    }

    const pinned: Manifest = {
      bun: 'a',
      claude: 'x',
      node: 'y',
      model: 'z',
      plugins: {
        main: '1',
        v1: '2',
        v2: '9',
      },
    }

    expect(() => verifyManifest(captured, pinned)).toThrowError(
      'Manifest mismatch\n' +
        'claude: captured=b pinned=x\n' +
        'node: captured=c pinned=y\n' +
        'model: captured=d pinned=z\n' +
        'plugins.v2: captured=3 pinned=9',
    )
  })

  it('throws with clear details on load/verify mismatch in memory', async () => {
    const lockPath = join(dir, 'manifest.lock.json')
    createLockFile(lockPath, {
      bun: '1',
      claude: '2',
      node: '3',
      model: '4',
      plugins: {
        main: 'm',
        v1: 'n',
        v2: 'o',
      },
    })

    const pinned = loadManifest(lockPath)
    const captured: Manifest = {
      bun: '1',
      claude: '2',
      node: 'DIFF',
      model: '4',
      plugins: {
        main: 'm',
        v1: 'n',
        v2: 'o',
      },
    }

    expect(() => verifyManifest(captured, pinned)).toThrow()
  })

  it('refuses to run when workspace mode is unspecified', () => {
    expect(() => resolveWorkspaceConfig({})).toThrowError(
      'Workspace mode unspecified. Set BENCH_WORKSPACE_MODE=isolated or BENCH_WORKSPACE_MODE=single-workspace.',
    )
  })

  it('single-workspace mode returns a cache disclaimer', () => {
    expect(
      resolveWorkspaceConfig({
        BENCH_WORKSPACE_MODE: 'single-workspace',
      }),
    ).toStrictEqual({
      mode: 'single-workspace',
      cacheDisclaimer:
        'cache-disabled baseline: single-workspace mode cannot claim clean cross-variant cache isolation.',
      keyEnvNames: ['ANTHROPIC_API_KEY'],
      adminVerification: 'not-applicable',
    })
  })

  it('isolated mode without an admin key is allowed but labeled operator-asserted', () => {
    expect(
      resolveWorkspaceConfig({
        BENCH_WORKSPACE_MODE: 'isolated',
      }),
    ).toStrictEqual({
      mode: 'isolated',
      cacheDisclaimer:
        'operator-asserted workspace isolation: distinct Anthropic workspace IDs supplied, but not admin-verified.',
      keyEnvNames: [
        'ANTHROPIC_API_KEY_BASELINE',
        'ANTHROPIC_API_KEY_CONTEXT_MODE',
        'ANTHROPIC_API_KEY_V1',
        'ANTHROPIC_API_KEY_V2',
      ],
      adminVerification: 'operator-asserted',
    })
  })

  it('isolated mode with an admin key keeps the stronger proof path', () => {
    expect(
      resolveWorkspaceConfig({
        BENCH_WORKSPACE_MODE: 'isolated',
        ANTHROPIC_ADMIN_KEY: 'admin-key',
      }),
    ).toStrictEqual({
      mode: 'isolated',
      cacheDisclaimer: null,
      keyEnvNames: [
        'ANTHROPIC_API_KEY_BASELINE',
        'ANTHROPIC_API_KEY_CONTEXT_MODE',
        'ANTHROPIC_API_KEY_V1',
        'ANTHROPIC_API_KEY_V2',
      ],
      adminVerification: 'required-for-proof',
    })
  })

  it('isolated mode requires all variant keys', () => {
    const config = resolveWorkspaceConfig({
      BENCH_WORKSPACE_MODE: 'isolated',
    })

    expect(() => validateWorkspaceKeyPresence(config, {})).toThrowError(
      'Missing workspace API keys: ANTHROPIC_API_KEY_BASELINE, ANTHROPIC_API_KEY_CONTEXT_MODE, ANTHROPIC_API_KEY_V1, ANTHROPIC_API_KEY_V2',
    )
  })

  it('isolated mode rejects duplicate workspace identities', () => {
    expect(() =>
      validateDistinctWorkspaces([
        { apiKeyEnv: 'ANTHROPIC_API_KEY_BASELINE', workspaceId: 'ws-1' },
        { apiKeyEnv: 'ANTHROPIC_API_KEY_CONTEXT_MODE', workspaceId: 'ws-1' },
      ]),
    ).toThrowError('Isolated mode requires distinct Anthropic workspaces for each variant key.')
  })

  it('isolated mode accepts distinct workspace identities', () => {
    expect(() =>
      validateDistinctWorkspaces([
        { apiKeyEnv: 'ANTHROPIC_API_KEY_BASELINE', workspaceId: 'ws-1' },
        { apiKeyEnv: 'ANTHROPIC_API_KEY_CONTEXT_MODE', workspaceId: 'ws-2' },
        { apiKeyEnv: 'ANTHROPIC_API_KEY_V1', workspaceId: 'ws-3' },
        { apiKeyEnv: 'ANTHROPIC_API_KEY_V2', workspaceId: 'ws-4' },
      ]),
    ).not.toThrow()
  })

  it('isolated mode resolves explicit workspace ids from env', () => {
    expect(
      resolveWorkspaceIdentitiesFromEnv({
        BENCH_WORKSPACE_MODE: 'isolated',
        ANTHROPIC_WORKSPACE_ID_BASELINE: 'ws-a',
        ANTHROPIC_WORKSPACE_ID_CONTEXT_MODE: 'ws-b',
        ANTHROPIC_WORKSPACE_ID_V1: 'ws-c',
        ANTHROPIC_WORKSPACE_ID_V2: 'ws-d',
      }),
    ).toStrictEqual([
      { apiKeyEnv: 'ANTHROPIC_API_KEY_BASELINE', workspaceId: 'ws-a' },
      { apiKeyEnv: 'ANTHROPIC_API_KEY_CONTEXT_MODE', workspaceId: 'ws-b' },
      { apiKeyEnv: 'ANTHROPIC_API_KEY_V1', workspaceId: 'ws-c' },
      { apiKeyEnv: 'ANTHROPIC_API_KEY_V2', workspaceId: 'ws-d' },
    ])
  })

  it('isolated mode requires explicit workspace id env vars', () => {
    expect(() =>
      resolveWorkspaceIdentitiesFromEnv({
        BENCH_WORKSPACE_MODE: 'isolated',
        ANTHROPIC_WORKSPACE_ID_BASELINE: 'ws-a',
      }),
    ).toThrowError(
      'Isolated mode requires ANTHROPIC_WORKSPACE_ID_BASELINE, ANTHROPIC_WORKSPACE_ID_CONTEXT_MODE, ANTHROPIC_WORKSPACE_ID_V1, and ANTHROPIC_WORKSPACE_ID_V2.',
    )
  })

  it('validates configured workspace ids against the Anthropic admin lookup', async () => {
    await expect(
      validateKnownAnthropicWorkspaces(
        [
          { apiKeyEnv: 'ANTHROPIC_API_KEY_BASELINE', workspaceId: 'ws-a' },
          { apiKeyEnv: 'ANTHROPIC_API_KEY_CONTEXT_MODE', workspaceId: 'ws-b' },
        ],
        'admin-key',
        async () => ['ws-a', 'ws-b', 'ws-c'],
      ),
    ).resolves.toBeUndefined()
  })

  it('fails when configured workspace ids are missing from the Anthropic admin lookup', async () => {
    await expect(
      validateKnownAnthropicWorkspaces(
        [
          { apiKeyEnv: 'ANTHROPIC_API_KEY_BASELINE', workspaceId: 'ws-a' },
          { apiKeyEnv: 'ANTHROPIC_API_KEY_CONTEXT_MODE', workspaceId: 'ws-missing' },
        ],
        'admin-key',
        async () => ['ws-a', 'ws-b'],
      ),
    ).rejects.toThrowError('Unknown Anthropic workspace IDs: ws-missing')
  })
})
