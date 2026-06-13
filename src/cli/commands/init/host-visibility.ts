import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'

import { SHARED_FAVORITE_SKILLS } from './scaffold-agent.js'

export const AGENT_HOSTS = ['codex', 'claude', 'opencode'] as const
export type AgentHost = (typeof AGENT_HOSTS)[number]

export const REQUIRED_CORE_CAPABILITIES = SHARED_FAVORITE_SKILLS

export const VISIBILITY_STATUSES = ['visible-now', 'visible-after-restart', 'not-visible'] as const
export type VisibilityStatus = (typeof VISIBILITY_STATUSES)[number]

export interface HostSkillRoots {
  readonly project: readonly string[]
  readonly user: readonly string[]
  readonly global: readonly string[]
}

export interface HostSkillVisibility {
  readonly host: AgentHost
  readonly capability: string
  readonly status: VisibilityStatus
  readonly checkedRoots: readonly string[]
  readonly foundPaths: readonly string[]
  readonly restartRequired: boolean
}

export interface HostVisibilityAudit {
  readonly selectedHosts: readonly AgentHost[]
  readonly requiredCapabilities: readonly string[]
  readonly results: readonly HostSkillVisibility[]
}

export interface AuditHostSkillVisibilityInput {
  readonly repoRoot: string
  readonly hosts?: readonly AgentHost[]
  readonly requiredCapabilities?: readonly string[]
  readonly homeDir?: string
  /** Slugs already observed in the active host session. Omit when a restart is needed. */
  readonly liveSkillSlugs?: ReadonlySet<string>
}

export function parseAgentHosts(value: string | undefined): AgentHost[] {
  if (value?.trim() === 'none') return []
  if (!value || value.trim().length === 0 || value.trim() === 'all') return [...AGENT_HOSTS]
  const out: AgentHost[] = []
  const unknown: string[] = []
  for (const raw of value.split(',')) {
    const token = raw.trim()
    if (!token) continue
    if ((AGENT_HOSTS as readonly string[]).includes(token)) out.push(token as AgentHost)
    else unknown.push(token)
  }
  if (unknown.length > 0) {
    throw new Error(
      `Unknown host(s): ${unknown.join(', ')}. Expected one of: ${AGENT_HOSTS.join(', ')}, all, none.`,
    )
  }
  return [...new Set(out)]
}

/**
 * Installed-plugin skill cache roots for a plugin host. Skills are delivered to
 * Claude/Codex by their plugins, which unpack to versioned cache dirs:
 *   `~/.claude/plugins/cache/<marketplace>/agent-kit/<version>/skills`
 *   `~/.codex/plugins/cache/<marketplace>/agent-kit/<version>/skills`
 * We scan every marketplace/version so a capability counts as visible when the
 * plugin is installed, independent of the (no-longer-projected) skill dirs.
 */
function pluginCacheSkillRoots(homeDir: string, vendor: 'claude' | 'codex'): string[] {
  const base =
    vendor === 'claude'
      ? join(homeDir, '.claude', 'plugins', 'cache')
      : join(homeDir, '.codex', 'plugins', 'cache')
  const roots: string[] = []
  try {
    for (const marketplace of readdirSync(base)) {
      const pluginDir = join(base, marketplace, 'agent-kit')
      let versions: string[]
      try {
        versions = readdirSync(pluginDir)
      } catch {
        continue
      }
      for (const version of versions) {
        const skills = join(pluginDir, version, 'skills')
        if (existsSync(skills)) roots.push(skills)
      }
    }
  } catch {
    // Cache dir absent — plugin not installed on this machine.
  }
  return roots
}

export function hostSkillRoots(
  repoRoot: string,
  host: AgentHost,
  homeDir = homedir(),
): HostSkillRoots {
  // The canonical `.agent/skills/` SSOT is always projected by `wp setup`, so a
  // required capability present there is installed in the repo and reaches a
  // plugin host through its plugin. Plugin install success/failure is reported
  // separately by the plugin scaffolder; visibility here confirms the skill is
  // installed (plugin cache) or at least present in the repo agent surface.
  const canonical = join(repoRoot, '.agent', 'skills')
  switch (host) {
    case 'codex':
      return {
        // `.agents/skills` only exists when the Codex plugin is opted out.
        project: [canonical, join(repoRoot, '.agents', 'skills')],
        user: [...pluginCacheSkillRoots(homeDir, 'codex'), join(homeDir, '.agents', 'skills')],
        global: ['/etc/codex/skills'],
      }
    case 'claude':
      return {
        // `.claude/skills` only exists when the Claude plugin is opted out.
        project: [canonical, join(repoRoot, '.claude', 'skills')],
        user: [...pluginCacheSkillRoots(homeDir, 'claude'), join(homeDir, '.claude', 'skills')],
        global: [],
      }
    case 'opencode':
      return {
        project: [
          join(repoRoot, '.opencode', 'skills'),
          canonical,
          join(repoRoot, '.claude', 'skills'),
          join(repoRoot, '.agents', 'skills'),
        ],
        user: [
          join(homeDir, '.config', 'opencode', 'skills'),
          join(homeDir, '.claude', 'skills'),
          join(homeDir, '.agents', 'skills'),
        ],
        global: [],
      }
  }
}

export function auditHostSkillVisibility(
  input: AuditHostSkillVisibilityInput,
): HostVisibilityAudit {
  const selectedHosts = input.hosts ? [...input.hosts] : [...AGENT_HOSTS]
  const requiredCapabilities =
    input.requiredCapabilities && input.requiredCapabilities.length > 0
      ? [...input.requiredCapabilities]
      : [...REQUIRED_CORE_CAPABILITIES]
  const results: HostSkillVisibility[] = []

  for (const host of selectedHosts) {
    const roots = hostSkillRoots(input.repoRoot, host, input.homeDir)
    const checkedRoots = [...roots.project, ...roots.user, ...roots.global]
    for (const capability of requiredCapabilities) {
      const foundPaths = checkedRoots
        .map((root) => join(root, capability, 'SKILL.md'))
        .filter((path) => existsSync(path))
      const status: VisibilityStatus =
        foundPaths.length === 0
          ? 'not-visible'
          : input.liveSkillSlugs?.has(capability) === true
            ? 'visible-now'
            : 'visible-after-restart'
      results.push({
        host,
        capability,
        status,
        checkedRoots,
        foundPaths,
        restartRequired: status === 'visible-after-restart',
      })
    }
  }

  return { selectedHosts, requiredCapabilities, results }
}

export function serializeHostVisibility(
  audit: HostVisibilityAudit,
): Record<string, Record<string, VisibilityStatus>> {
  const byHost: Record<string, Record<string, VisibilityStatus>> = {}
  for (const result of audit.results) {
    byHost[result.host] ??= {}
    byHost[result.host]![result.capability] = result.status
  }
  return byHost
}

export function summarizeHostVisibility(repoRoot: string, audit: HostVisibilityAudit): string[] {
  return audit.results.map((result) => {
    const detail =
      result.foundPaths.length > 0
        ? result.foundPaths.map((path) => relative(repoRoot, path).replaceAll('\\', '/')).join(', ')
        : result.checkedRoots
            .map((path) => relative(repoRoot, path).replaceAll('\\', '/'))
            .join(', ')
    const marker =
      result.status === 'not-visible' ? '✗' : result.status === 'visible-now' ? '✓' : '↻'
    return `  ${result.host}: ${marker} ${result.capability} ${result.status} (${detail})`
  })
}
