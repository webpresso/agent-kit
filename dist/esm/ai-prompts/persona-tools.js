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
};
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
];
const TOOL_NAME_SET = new Set(ALL_TOOLS);
function resolveToolAccessName(toolName) {
    if (toolName.startsWith('mcp_'))
        return 'mcp';
    if (TOOL_NAME_SET.has(toolName))
        return toolName;
    return toolName;
}
export const PERSONA_TOOL_CONFIG = {
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
        description: 'Read access for UX review. Limited write access for documentation and copy changes.',
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
        description: 'Full access for backend and infrastructure. Prioritizes data flow and scalability.',
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
        description: 'Full access for engineering organization work. Prioritizes team topology, culture, and leadership.',
    },
};
function getPriorityRank(entry, prioritizedSet, prioritizedList) {
    return prioritizedSet.has(entry.accessName)
        ? prioritizedList.indexOf(entry.accessName)
        : Number.POSITIVE_INFINITY;
}
function compareToolEntries(a, b, prioritizedSet, prioritizedList) {
    const aRank = getPriorityRank(a, prioritizedSet, prioritizedList);
    const bRank = getPriorityRank(b, prioritizedSet, prioritizedList);
    if (aRank !== bRank)
        return aRank - bRank;
    return a.name.localeCompare(b.name);
}
function createToolComparator(prioritizedSet, prioritizedList) {
    return (a, b) => compareToolEntries(a, b, prioritizedSet, prioritizedList);
}
function resolveToolEntries(toolNames) {
    return toolNames.map((name) => ({
        name,
        accessName: resolveToolAccessName(name),
    }));
}
function filterRestrictedTools(entries, restrictedSet) {
    return entries.filter((entry) => !restrictedSet.has(entry.accessName));
}
function sortToolsByPriority(entries, prioritizedSet, prioritizedList) {
    return entries
        .toSorted(createToolComparator(prioritizedSet, prioritizedList))
        .map((entry) => entry.name);
}
export function filterToolsForPersona(toolNames, persona) {
    const config = PERSONA_TOOL_CONFIG[persona];
    const prioritizedSet = new Set(config.prioritized);
    const restrictedSet = new Set(config.restricted);
    const resolved = resolveToolEntries(toolNames);
    const allowed = filterRestrictedTools(resolved, restrictedSet);
    return sortToolsByPriority(allowed, prioritizedSet, config.prioritized);
}
export function isToolAllowedForPersona(toolName, persona) {
    const config = PERSONA_TOOL_CONFIG[persona];
    const accessName = resolveToolAccessName(toolName);
    return !config.restricted.includes(accessName);
}
export function getPersonaToolDescription(persona) {
    return PERSONA_TOOL_CONFIG[persona].description;
}
export function getRestrictedToolsForPersona(persona) {
    return PERSONA_TOOL_CONFIG[persona].restricted;
}
//# sourceMappingURL=persona-tools.js.map