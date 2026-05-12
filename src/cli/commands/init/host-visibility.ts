import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'

export const AGENT_HOSTS = ['codex', 'claude', 'opencode'] as const
export type AgentHost = (typeof AGENT_HOSTS)[number]

export const REQUIRED_CORE_CAPABILITIES = ['verify', 'plan-refine'] as const

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
      `Unknown host(s): ${unknown.join(', ')}. Expected one of: ${AGENT_HOSTS.join(', ')}, all.`,
    )
  }
  return [...new Set(out)]
}

export function hostSkillRoots(
  repoRoot: string,
  host: AgentHost,
  homeDir = homedir(),
): HostSkillRoots {
  switch (host) {
    case 'codex':
      return {
        project: [join(repoRoot, '.agents', 'skills')],
        user: [join(homeDir, '.agents', 'skills')],
        global: ['/etc/codex/skills'],
      }
    case 'claude':
      return {
        project: [join(repoRoot, '.claude', 'skills')],
        user: [join(homeDir, '.claude', 'skills')],
        global: [],
      }
    case 'opencode':
      return {
        project: [
          join(repoRoot, '.opencode', 'skills'),
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
  const selectedHosts = input.hosts && input.hosts.length > 0 ? [...input.hosts] : [...AGENT_HOSTS]
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
