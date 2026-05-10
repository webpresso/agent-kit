import type { AgentPersona } from './types.js'

export const TOOL_CATEGORIES = {
  file: ['read_file', 'write_file', 'list_files', 'search_files'],
  git: [
    'git_status',
    'git_diff',
    'git_stage',
    'git_commit',
    'git_log',
    'git_branch',
    'git_pull',
    'git_push',
    'git_suggest_commit',
  ],
  analysis: ['analyze_code', 'explain_code'],
  documentation: ['generate_adr'],
  execution: ['execute_command'],
  changes: ['apply_pending_changes', 'changes_list', 'changes_diff', 'changes_revert'],
  lsp: ['lsp'],
  task: ['task'],
  mcp: ['mcp'],
} as const

export const ALL_TOOLS = [
  ...TOOL_CATEGORIES.file,
  ...TOOL_CATEGORIES.git,
  ...TOOL_CATEGORIES.analysis,
  ...TOOL_CATEGORIES.documentation,
  ...TOOL_CATEGORIES.execution,
  ...TOOL_CATEGORIES.changes,
  ...TOOL_CATEGORIES.lsp,
  ...TOOL_CATEGORIES.task,
  ...TOOL_CATEGORIES.mcp,
] as const

export type ToolName = (typeof ALL_TOOLS)[number]

export interface PersonaToolConfig {
  prioritized: readonly ToolName[]
  allowed?: readonly ToolName[]
  restricted: readonly ToolName[]
  description: string
}

const TOOL_NAME_SET = new Set<ToolName>(ALL_TOOLS)

function resolveToolAccessName(toolName: string): ToolName | string {
  if (toolName.startsWith('mcp_')) return 'mcp'
  if (TOOL_NAME_SET.has(toolName as ToolName)) return toolName as ToolName
  return toolName
}

export const PERSONA_TOOL_CONFIG: Record<AgentPersona, PersonaToolConfig> = {
  steve: {
    prioritized: ['explain_code', 'read_file', 'list_files', 'search_files', 'analyze_code'],
    restricted: [
      'execute_command',
      'write_file',
      'apply_pending_changes',
      'changes_revert',
      'task',
      'mcp',
      ...TOOL_CATEGORIES.git,
    ],
    description: 'Read-only access for business context. Cannot modify code or run commands.',
  },
  rachel: {
    prioritized: ['explain_code', 'read_file', 'search_files', 'list_files', 'analyze_code'],
    restricted: [
      'execute_command',
      'git_push',
      'git_pull',
      'apply_pending_changes',
      'changes_revert',
      'task',
      'mcp',
    ],
    description:
      'Read access for UX review. Limited write access for documentation and copy changes.',
  },
  ozby: {
    prioritized: [
      'analyze_code',
      'read_file',
      'write_file',
      'git_status',
      'git_diff',
      'execute_command',
      'search_files',
      'generate_adr',
    ],
    restricted: [],
    description: 'Full access to all technical tools for engineering tasks.',
  },
  volker: {
    prioritized: [
      'analyze_code',
      'read_file',
      'search_files',
      'git_diff',
      'git_status',
      'execute_command',
      'list_files',
      'generate_adr',
    ],
    restricted: [],
    description: 'Full access for code quality review. Prioritizes analysis and testing.',
  },
  jeramy: {
    prioritized: [
      'read_file',
      'search_files',
      'execute_command',
      'analyze_code',
      'git_status',
      'git_diff',
      'list_files',
      'generate_adr',
    ],
    restricted: [],
    description:
      'Full access for backend and infrastructure. Prioritizes data flow and scalability.',
  },
  rodrigo: {
    prioritized: [
      'read_file',
      'search_files',
      'analyze_code',
      'execute_command',
      'git_status',
      'git_diff',
      'list_files',
    ],
    restricted: [],
    description:
      'Full access for engineering organization work. Prioritizes team topology, culture, and leadership.',
  },
} as const

interface ToolEntry {
  name: string
  accessName: string
}

function getPriorityRank(
  entry: ToolEntry,
  prioritizedSet: Set<ToolName>,
  prioritizedList: readonly ToolName[],
): number {
  return prioritizedSet.has(entry.accessName as ToolName)
    ? prioritizedList.indexOf(entry.accessName as ToolName)
    : Number.POSITIVE_INFINITY
}

function compareToolEntries(
  a: ToolEntry,
  b: ToolEntry,
  prioritizedSet: Set<ToolName>,
  prioritizedList: readonly ToolName[],
): number {
  const aRank = getPriorityRank(a, prioritizedSet, prioritizedList)
  const bRank = getPriorityRank(b, prioritizedSet, prioritizedList)
  if (aRank !== bRank) return aRank - bRank
  return a.name.localeCompare(b.name)
}

function createToolComparator(
  prioritizedSet: Set<ToolName>,
  prioritizedList: readonly ToolName[],
): (a: ToolEntry, b: ToolEntry) => number {
  return (a, b): number => compareToolEntries(a, b, prioritizedSet, prioritizedList)
}

function resolveToolEntries(toolNames: readonly string[]): ToolEntry[] {
  return toolNames.map((name) => ({
    name,
    accessName: resolveToolAccessName(name),
  }))
}

function filterRestrictedTools(entries: ToolEntry[], restrictedSet: Set<ToolName>): ToolEntry[] {
  return entries.filter((entry) => !restrictedSet.has(entry.accessName as ToolName))
}

function sortToolsByPriority(
  entries: ToolEntry[],
  prioritizedSet: Set<ToolName>,
  prioritizedList: readonly ToolName[],
): string[] {
  return entries
    .toSorted(createToolComparator(prioritizedSet, prioritizedList))
    .map((entry) => entry.name)
}

export function filterToolsForPersona(
  toolNames: readonly string[],
  persona: AgentPersona,
): string[] {
  const config = PERSONA_TOOL_CONFIG[persona]
  const prioritizedSet = new Set(config.prioritized)
  const restrictedSet = new Set(config.restricted)

  const resolved = resolveToolEntries(toolNames)
  const allowed = filterRestrictedTools(resolved, restrictedSet)
  return sortToolsByPriority(allowed, prioritizedSet, config.prioritized)
}

export function isToolAllowedForPersona(toolName: string, persona: AgentPersona): boolean {
  const config = PERSONA_TOOL_CONFIG[persona]
  const accessName = resolveToolAccessName(toolName)
  return !config.restricted.includes(accessName as ToolName)
}

export function getPersonaToolDescription(persona: AgentPersona): string {
  return PERSONA_TOOL_CONFIG[persona].description
}

export function getRestrictedToolsForPersona(persona: AgentPersona): readonly ToolName[] {
  return PERSONA_TOOL_CONFIG[persona].restricted
}
