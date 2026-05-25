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
  hosts?: {
    selected: AgentHost[]
    requiredCapabilities: string[]
    visibility?: Record<string, Record<string, VisibilityStatus>>
  }
  mcp?: {
    serverName?: string
    toolPrefix?: string
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

export function readConfig(repoRoot: string): AgentkitConfig | null {
  const path = join(repoRoot, CONFIG_FILENAME)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AgentkitConfig>
    const installed = parsed.installed as Partial<AgentkitConfig['installed']> | undefined
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
      ...(normalizedMcp ? { mcp: normalizedMcp } : {}),
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
  return {
    version: incoming.version,
    installed: { tier3Skills: tier3 },
    hosts: incoming.hosts ?? existing.hosts,
    ...(mergedMcp ? { mcp: mergedMcp } : {}),
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
