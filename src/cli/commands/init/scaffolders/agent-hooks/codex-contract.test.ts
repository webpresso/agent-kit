import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CodexAppServerClient } from '../../../../../codex/app-server/client.js'
import type { CommandHookMetadata } from '../../../../../codex/app-server/types.js'
import { isWebpressoOwnedCodexHook } from './codex-ownership.js'
import { scaffoldAgentHooks } from './index.js'

const FORBIDDEN_LOCAL_HASH_SYMBOLS = [
  'codex' + 'CommandHookHash',
  'versionFor' + 'CodexTomlIdentity',
  'upsert' + 'CodexHookTrustStates',
] as const

const CODEX_ENV_REASON = 'WP_CODEX_CONTRACT=1 is required'
const CODEX_BINARY_REASON = 'codex --version is unavailable'

type CommandExists = (command: string, args: readonly string[]) => boolean

function commandExists(command: string, args: readonly string[]): boolean {
  const codexHome = mkdtempSync(join(tmpdir(), 'wp-codex-version-home-'))
  try {
    const result = spawnSync(command, [...args], {
      encoding: 'utf8',
      env: { ...process.env, CODEX_HOME: codexHome },
      timeout: 5_000,
    })
    return result.status === 0
  } finally {
    rmSync(codexHome, { recursive: true, force: true })
  }
}

function codexContractSkipReason(
  env: NodeJS.ProcessEnv = process.env,
  exists: CommandExists = commandExists,
): string | null {
  if (env.WP_CODEX_CONTRACT !== '1') return CODEX_ENV_REASON
  if (!exists('codex', ['--version'])) return CODEX_BINARY_REASON
  return null
}

function codexContractTestTitle(skipReason: string | null): string {
  const suffix = skipReason === null ? 'enabled by WP_CODEX_CONTRACT=1' : `skipped: ${skipReason}`
  return `live Codex app-server owns hook hashes (${suffix})`
}

function productionSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return productionSourceFiles(path)
    if (!entry.isFile() || !entry.name.endsWith('.ts')) return []
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.integration.test.ts')) return []
    return [path]
  })
}

function webpressoCodexHooks(hooks: unknown[], sourcePath: string): CommandHookMetadata[] {
  return hooks.filter((hook): hook is CommandHookMetadata => {
    const candidate = hook as Partial<CommandHookMetadata>
    return candidate.handlerType === 'command' && isWebpressoOwnedCodexHook(candidate, [sourcePath])
  })
}

describe('Codex hook trust contract', () => {
  it('does not retain local Codex hook hash/trust helpers in production source', () => {
    const srcRoot = resolve(process.cwd(), 'src')
    const matches = productionSourceFiles(srcRoot).flatMap((file) => {
      const contents = readFileSync(file, 'utf8')
      return FORBIDDEN_LOCAL_HASH_SYMBOLS.flatMap((symbol) =>
        contents.includes(symbol) ? [`${file}: ${symbol}`] : [],
      )
    })

    expect(matches).toStrictEqual([])
  })

  it('includes the missing env-var reason in skipped live-test output', () => {
    const reason = codexContractSkipReason({}, () => true)

    expect(reason).toBe(CODEX_ENV_REASON)
    expect(codexContractTestTitle(reason)).toContain(CODEX_ENV_REASON)
  })

  it('includes the missing codex binary reason in skipped live-test output', () => {
    const reason = codexContractSkipReason({ WP_CODEX_CONTRACT: '1' }, () => false)

    expect(reason).toBe(CODEX_BINARY_REASON)
    expect(codexContractTestTitle(reason)).toContain(CODEX_BINARY_REASON)
  })

  const liveSkipReason = codexContractSkipReason()
  const liveIt = liveSkipReason === null ? it : it.skip

  liveIt(codexContractTestTitle(liveSkipReason), async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'wp-codex-contract-repo-'))
    const codexHome = mkdtempSync(join(tmpdir(), 'wp-codex-contract-home-'))
    const previousCodexHome = process.env.CODEX_HOME

    try {
      const gitInit = spawnSync('git', ['init', '--quiet'], { cwd: repoRoot, encoding: 'utf8' })
      expect(gitInit.status, gitInit.stderr || gitInit.stdout).toBe(0)

      process.env.CODEX_HOME = codexHome

      await scaffoldAgentHooks({ repoRoot, options: {} })

      const hooksPath = resolve(repoRoot, '.codex', 'hooks.json')
      expect(existsSync(hooksPath)).toBe(true)
      expect(existsSync(join(codexHome, 'config.toml'))).toBe(true)

      const api = await CodexAppServerClient.start({ cwd: repoRoot })
      try {
        const listed = await api.hooksList([repoRoot])
        const hooks = listed.data.flatMap((entry) => entry.hooks)
        const ownedHooks = webpressoCodexHooks(hooks, hooksPath)

        expect(ownedHooks.length).toBeGreaterThan(0)
        expect(ownedHooks.every((hook) => hook.currentHash.length > 0)).toBe(true)
        expect(ownedHooks.map((hook) => hook.trustStatus)).toStrictEqual(
          ownedHooks.map(() => 'trusted'),
        )
      } finally {
        await api.close()
      }
    } finally {
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME
      else process.env.CODEX_HOME = previousCodexHome
      rmSync(repoRoot, { recursive: true, force: true })
      rmSync(codexHome, { recursive: true, force: true })
    }
  })
})
