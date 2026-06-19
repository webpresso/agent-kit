import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import type {
  CodexAppServerApi,
  CommandHookMetadata,
  HooksListResponse,
} from '#codex/app-server/types.js'
import { isWebpressoOwnedCodexHook } from './codex-ownership.js'

export interface SyncCodexHookTrustInput {
  readonly repoRoot: string
  /**
   * Absolute path to the Codex config.toml that holds [hooks].state trust entries.
   * Defaults to ~/.codex/config.toml (honouring $CODEX_HOME).
   * Must point to a TOML config file, NOT to hooks.json — writing `hooks.state` into
   * hooks.json causes Codex's deny_unknown_fields HooksFile parser to reject it entirely.
   */
  readonly codexConfigFilePath?: string
  readonly expectedSourcePaths?: readonly string[]
  readonly hookDescription?: string
  readonly selectHook?: (
    metadata: unknown,
    expectedSourcePaths: readonly string[],
  ) => metadata is CommandHookMetadata
}

export function defaultCodexConfigFilePath(): string {
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex')
  return join(codexHome, 'config.toml')
}

export type CodexTrustStateUpdate = Record<string, { enabled: true; trusted_hash: string }>

export type SyncCodexHookTrustResult =
  | {
      readonly ok: true
      readonly trustedKeys: readonly string[]
      readonly state: CodexTrustStateUpdate
    }
  | {
      readonly ok: false
      readonly reason:
        | 'no-webpresso-hooks-found'
        | 'hooks-list-failed'
        | 'config-write-failed'
        | 'verification-failed'
      readonly message: string
    }

export async function syncCodexHookTrustWithAppServer(
  api: CodexAppServerApi,
  input: SyncCodexHookTrustInput,
): Promise<SyncCodexHookTrustResult> {
  const expectedSourcePaths = normalizeExpectedSourcePaths(input)
  const hookDescription = input.hookDescription ?? 'webpresso-owned'
  const selectHook = input.selectHook ?? isWebpressoOwnedCodexHook

  let firstList
  try {
    firstList = await api.hooksList([input.repoRoot])
  } catch (error) {
    return failure('hooks-list-failed', error)
  }

  const ownedHooks = collectOwnedHooks(firstList, expectedSourcePaths, selectHook)
  if (ownedHooks.length === 0) {
    return {
      ok: false,
      reason: 'no-webpresso-hooks-found',
      message: `No ${hookDescription} Codex hooks found for ${input.repoRoot}`,
    }
  }

  const state = buildCodexTrustStateUpdate(ownedHooks)
  const configFilePath = input.codexConfigFilePath ?? defaultCodexConfigFilePath()

  try {
    await api.configBatchWrite({
      edits: [{ keyPath: 'hooks.state', value: state, mergeStrategy: 'upsert' }],
      filePath: configFilePath,
      reloadUserConfig: true,
    })
  } catch (error) {
    return failure('config-write-failed', error)
  }

  let secondList
  try {
    secondList = await api.hooksList([input.repoRoot])
  } catch (error) {
    return failure('verification-failed', error)
  }

  const verification = verifyTrustedHooks(secondList, ownedHooks)
  if (!verification.ok) {
    return verification
  }

  return {
    ok: true,
    trustedKeys: ownedHooks.map((hook) => hook.key),
    state,
  }
}

export function defaultExpectedCodexHookSourcePaths(repoRoot: string): readonly string[] {
  return [resolve(repoRoot, '.codex', 'hooks.json')]
}

export function buildCodexTrustStateUpdate(
  hooks: readonly CommandHookMetadata[],
): CodexTrustStateUpdate {
  return Object.fromEntries(
    hooks.map((hook) => [hook.key, { enabled: true, trusted_hash: hook.currentHash }]),
  )
}

function collectOwnedHooks(
  response: HooksListResponse,
  expectedSourcePaths: readonly string[],
  selectHook: (
    metadata: unknown,
    expectedSourcePaths: readonly string[],
  ) => metadata is CommandHookMetadata,
): CommandHookMetadata[] {
  return response.data.flatMap((entry) =>
    entry.hooks.filter((hook): hook is CommandHookMetadata =>
      selectHook(hook, expectedSourcePaths),
    ),
  )
}

function verifyTrustedHooks(
  response: HooksListResponse,
  ownedHooks: readonly CommandHookMetadata[],
): SyncCodexHookTrustResult {
  const latestByKey = new Map<string, CommandHookMetadata>()
  for (const entry of response.data) {
    for (const hook of entry.hooks) {
      if (
        hook.handlerType === 'command' &&
        typeof hook.command === 'string' &&
        hook.command.length > 0
      ) {
        latestByKey.set(hook.key, hook as CommandHookMetadata)
      }
    }
  }

  const failed = ownedHooks.find((hook) => {
    const latest = latestByKey.get(hook.key)
    return latest === undefined || latest.trustStatus !== 'trusted' || latest.enabled !== true
  })
  if (!failed) {
    return {
      ok: true,
      trustedKeys: ownedHooks.map((hook) => hook.key),
      state: buildCodexTrustStateUpdate(ownedHooks),
    }
  }

  const latest = latestByKey.get(failed.key)
  return {
    ok: false,
    reason: 'verification-failed',
    message:
      latest === undefined
        ? `Hook ${failed.key} was not returned by hooks/list after trust sync`
        : `Hook ${failed.key} remained ${latest.trustStatus} enabled=${String(latest.enabled)} after trust sync`,
  }
}

function normalizeExpectedSourcePaths(input: SyncCodexHookTrustInput): readonly string[] {
  return input.expectedSourcePaths?.length
    ? input.expectedSourcePaths.map((path) => resolve(path))
    : defaultExpectedCodexHookSourcePaths(input.repoRoot)
}

function failure(
  reason: Extract<SyncCodexHookTrustResult, { ok: false }>['reason'],
  error: unknown,
): SyncCodexHookTrustResult {
  return {
    ok: false,
    reason,
    message: error instanceof Error ? error.message : String(error),
  }
}
