/**
 * `.webpressorc.json` read/write. Captures the consumer's opt-in choices so
 * re-runs of `wp init` are idempotent without re-prompting.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { AgentHost, VisibilityStatus } from './host-visibility.js'
import { REQUIRED_CORE_CAPABILITIES } from './host-visibility.js'

export const CONFIG_VERSION = '1'
export const CONFIG_FILENAME = '.webpressorc.json'
export const LEGACY_CONFIG_FILENAME = '.agent-kitrc.json'
export const DEFAULT_DURABLE_PLANNING_ROOT = '.agent/planning/'

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export interface AgentkitConfig {
  version: string
  installed: {
    tier3Skills: string[]
  }
  /** Audit policy overrides. `mechanism` lives in agent-kit; this is per-repo
   *  `data`. `toolchainIsolation.allowDependencies` lists dependency names that
   *  are exempt from the toolchain-isolation audit because they are legitimate
   *  app-specific runtimes, not generic toolchain. */
  audit?: {
    toolchainIsolation?: {
      allowDependencies?: string[]
    }
  }
  hosts?: {
    selected: AgentHost[]
    requiredCapabilities: string[]
    visibility?: Record<string, Record<string, VisibilityStatus>>
  }
  mcp?: {
    serverName?: string
    toolPrefix?: string
  }
  /** Pretool-guard routing policy. `mechanism` lives in agent-kit; this is the
   *  per-repo `data`. `scriptRoutes` maps a package-script name (e.g.
   *  `docs:check`) to a `wp_audit` kind; `packageManager: 'vp-only'` opts into
   *  routing all raw `pnpm`/`npm` invocations to the `vp` facade. */
  guard?: {
    packageManager?: 'vp-only'
    scriptRoutes?: Record<string, string>
  }
  rules: {
    overrides: string[]
  }
  scripts: {
    'setup-agent'?: string
  }
  durablePlanningRoot: string
  blueprintsDir?: string
  lastInit?: string
  /** True when webpresso is installed globally rather than as a devDep.
   *  Skips the devDependency presence check in `wp audit guardrails`. */
  globalInstall?: boolean
}

export function defaultConfig(): AgentkitConfig {
  return {
    version: CONFIG_VERSION,
    installed: { tier3Skills: [] },
    hosts: {
      selected: [],
      requiredCapabilities: [...REQUIRED_CORE_CAPABILITIES],
    },
    rules: { overrides: [] },
    scripts: {},
    durablePlanningRoot: DEFAULT_DURABLE_PLANNING_ROOT,
  }
}

function parseConfigFile(path: string): AgentkitConfig | null {
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AgentkitConfig>
    const installed = parsed.installed as Partial<AgentkitConfig['installed']> | undefined
    const audit = parsed.audit as Partial<NonNullable<AgentkitConfig['audit']>> | undefined
    const mcp = parsed.mcp as Partial<NonNullable<AgentkitConfig['mcp']>> | undefined
    const hosts = parsed.hosts as Partial<NonNullable<AgentkitConfig['hosts']>> | undefined
    const rules = parsed.rules as Partial<AgentkitConfig['rules']> | undefined
    const scripts = parsed.scripts as Partial<AgentkitConfig['scripts']> | undefined
    const tier3 = Array.isArray(installed?.tier3Skills) ? installed.tier3Skills : []
    const overrides = Array.isArray(rules?.overrides) ? rules.overrides : []
    const durablePlanningRoot = readOptionalString(parsed.durablePlanningRoot)
    const blueprintsDir = readOptionalString((parsed as { blueprintsDir?: unknown }).blueprintsDir)
    const serverName = readOptionalString(mcp?.serverName)
    const toolPrefix = readOptionalString(mcp?.toolPrefix)
    const normalizedMcp =
      serverName || toolPrefix
        ? { ...(serverName ? { serverName } : {}), ...(toolPrefix ? { toolPrefix } : {}) }
        : undefined
    const guard = parsed.guard as Partial<NonNullable<AgentkitConfig['guard']>> | undefined
    const packageManager = guard?.packageManager === 'vp-only' ? ('vp-only' as const) : undefined
    const rawScriptRoutes =
      guard?.scriptRoutes && typeof guard.scriptRoutes === 'object'
        ? Object.fromEntries(
            Object.entries(guard.scriptRoutes).filter(
              ([key, value]) => typeof key === 'string' && typeof value === 'string',
            ),
          )
        : undefined
    const scriptRoutes =
      rawScriptRoutes && Object.keys(rawScriptRoutes).length > 0 ? rawScriptRoutes : undefined
    const normalizedGuard =
      packageManager || scriptRoutes
        ? {
            ...(packageManager ? { packageManager } : {}),
            ...(scriptRoutes ? { scriptRoutes } : {}),
          }
        : undefined
    const rawToolchainIsolation = audit?.toolchainIsolation as
      | Partial<NonNullable<NonNullable<AgentkitConfig['audit']>['toolchainIsolation']>>
      | undefined
    const allowDependencies = Array.isArray(rawToolchainIsolation?.allowDependencies)
      ? rawToolchainIsolation.allowDependencies.filter(
          (value): value is string => typeof value === 'string' && value.length > 0,
        )
      : undefined
    const normalizedAudit =
      allowDependencies && allowDependencies.length > 0
        ? {
            toolchainIsolation: {
              allowDependencies,
            },
          }
        : undefined
    const selectedHosts = Array.isArray(hosts?.selected)
      ? hosts.selected.filter((s): s is AgentHost =>
          ['codex', 'claude', 'opencode'].includes(String(s)),
        )
      : []
    const requiredCapabilities = Array.isArray(hosts?.requiredCapabilities)
      ? hosts.requiredCapabilities.filter((s): s is string => typeof s === 'string')
      : [...REQUIRED_CORE_CAPABILITIES]
    const visibility =
      hosts?.visibility && typeof hosts.visibility === 'object'
        ? (hosts.visibility as Record<string, Record<string, VisibilityStatus>>)
        : undefined
    return {
      version: typeof parsed.version === 'string' ? parsed.version : CONFIG_VERSION,
      installed: { tier3Skills: tier3.filter((s): s is string => typeof s === 'string') },
      hosts: {
        selected: selectedHosts,
        requiredCapabilities,
        ...(visibility ? { visibility } : {}),
      },
      ...(normalizedAudit ? { audit: normalizedAudit } : {}),
      ...(normalizedMcp ? { mcp: normalizedMcp } : {}),
      ...(normalizedGuard ? { guard: normalizedGuard } : {}),
      rules: { overrides: overrides.filter((s): s is string => typeof s === 'string') },
      scripts: {
        'setup-agent': readOptionalString(scripts?.['setup-agent']),
      },
      durablePlanningRoot: durablePlanningRoot ?? DEFAULT_DURABLE_PLANNING_ROOT,
      ...(blueprintsDir ? { blueprintsDir } : {}),
      lastInit: readOptionalString(parsed.lastInit),
      ...((parsed as { globalInstall?: unknown }).globalInstall === true
        ? { globalInstall: true as const }
        : {}),
    }
  } catch {
    return null
  }
}

export function readConfig(repoRoot: string): AgentkitConfig | null {
  const configPath = join(repoRoot, CONFIG_FILENAME)
  if (existsSync(configPath)) return parseConfigFile(configPath)

  const legacyConfigPath = join(repoRoot, LEGACY_CONFIG_FILENAME)
  if (existsSync(legacyConfigPath)) return parseConfigFile(legacyConfigPath)

  return null
}

export function mergeConfig(
  existing: AgentkitConfig | null,
  incoming: AgentkitConfig,
): AgentkitConfig {
  if (!existing) return incoming
  const tier3 = Array.from(
    new Set([...existing.installed.tier3Skills, ...incoming.installed.tier3Skills]),
  ).toSorted()
  const overrides = Array.from(
    new Set([...existing.rules.overrides, ...incoming.rules.overrides]),
  ).toSorted()
  const mergedMcp =
    existing.mcp || incoming.mcp
      ? {
          ...existing.mcp,
          ...incoming.mcp,
        }
      : undefined
  const mergedAllowDependencies = Array.from(
    new Set([
      ...(existing.audit?.toolchainIsolation?.allowDependencies ?? []),
      ...(incoming.audit?.toolchainIsolation?.allowDependencies ?? []),
    ]),
  ).toSorted()
  const mergedAudit =
    mergedAllowDependencies.length > 0
      ? {
          toolchainIsolation: {
            allowDependencies: mergedAllowDependencies,
          },
        }
      : undefined
  const mergedScriptRoutes =
    existing.guard?.scriptRoutes || incoming.guard?.scriptRoutes
      ? { ...existing.guard?.scriptRoutes, ...incoming.guard?.scriptRoutes }
      : undefined
  const mergedGuard =
    existing.guard || incoming.guard
      ? {
          ...existing.guard,
          ...incoming.guard,
          ...(mergedScriptRoutes ? { scriptRoutes: mergedScriptRoutes } : {}),
        }
      : undefined
  return {
    version: incoming.version,
    installed: { tier3Skills: tier3 },
    hosts: incoming.hosts ?? existing.hosts,
    ...(mergedAudit ? { audit: mergedAudit } : {}),
    ...(mergedMcp ? { mcp: mergedMcp } : {}),
    ...(mergedGuard ? { guard: mergedGuard } : {}),
    rules: { overrides },
    scripts: {
      'setup-agent': incoming.scripts['setup-agent'] ?? existing.scripts['setup-agent'],
    },
    durablePlanningRoot: incoming.durablePlanningRoot || existing.durablePlanningRoot,
    blueprintsDir: incoming.blueprintsDir ?? existing.blueprintsDir,
    lastInit: incoming.lastInit ?? existing.lastInit,
    ...((incoming.globalInstall ?? existing.globalInstall) ? { globalInstall: true as const } : {}),
  }
}

export function writeConfig(repoRoot: string, config: AgentkitConfig): void {
  const path = join(repoRoot, CONFIG_FILENAME)
  const payload = `${JSON.stringify(config, null, 2)}\n`
  writeFileSync(path, payload)
}
