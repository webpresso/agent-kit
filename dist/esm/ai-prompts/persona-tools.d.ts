import type { AgentPersona } from './types.js';
export declare const TOOL_CATEGORIES: {
    readonly file: readonly ["read_file", "write_file", "list_files", "search_files"];
    readonly git: readonly ["git_status", "git_diff", "git_stage", "git_commit", "git_log", "git_branch", "git_pull", "git_push", "git_suggest_commit"];
    readonly analysis: readonly ["analyze_code", "explain_code"];
    readonly documentation: readonly ["generate_adr"];
    readonly execution: readonly ["execute_command"];
    readonly changes: readonly ["apply_pending_changes", "changes_list", "changes_diff", "changes_revert"];
    readonly lsp: readonly ["lsp"];
    readonly task: readonly ["task"];
    readonly mcp: readonly ["mcp"];
};
export declare const ALL_TOOLS: readonly ["read_file", "write_file", "list_files", "search_files", "git_status", "git_diff", "git_stage", "git_commit", "git_log", "git_branch", "git_pull", "git_push", "git_suggest_commit", "analyze_code", "explain_code", "generate_adr", "execute_command", "apply_pending_changes", "changes_list", "changes_diff", "changes_revert", "lsp", "task", "mcp"];
export type ToolName = (typeof ALL_TOOLS)[number];
export interface PersonaToolConfig {
    prioritized: readonly ToolName[];
    allowed?: readonly ToolName[];
    restricted: readonly ToolName[];
    description: string;
}
export declare const PERSONA_TOOL_CONFIG: Record<AgentPersona, PersonaToolConfig>;
export declare function filterToolsForPersona(toolNames: readonly string[], persona: AgentPersona): string[];
export declare function isToolAllowedForPersona(toolName: string, persona: AgentPersona): boolean;
export declare function getPersonaToolDescription(persona: AgentPersona): string;
export declare function getRestrictedToolsForPersona(persona: AgentPersona): readonly ToolName[];
//# sourceMappingURL=persona-tools.d.ts.map