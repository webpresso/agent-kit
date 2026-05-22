import type { ToolInput, ValidationResult } from '#hooks/shared/types';
import { type MCPRedirectConfig } from './mcp-redirect.js';
export type CommandCategory = 'test' | 'lint' | 'typecheck' | 'format' | 'blueprint' | 'unknown';
export interface CommandRule {
    pattern: RegExp;
    category: CommandCategory;
    suggestion: string;
}
export interface SuggestionModifier {
    pattern: RegExp;
    category: CommandCategory;
    suggestion: string;
}
export interface BlockedCommandResult extends ValidationResult {
    command: string;
    suggestion: string;
    category: CommandCategory;
    docsRef: string;
    matchedPattern: string;
}
interface BlockedToolSpec {
    tool: string;
    category: CommandCategory;
    suggestion: string;
    runners: ('exec' | 'direct' | 'bare')[];
}
interface BlockedScriptSpec {
    script: string;
    category: CommandCategory;
    suggestion: string;
}
interface RedirectOptions {
    mcpReady?: boolean;
    mcp?: MCPRedirectConfig;
}
export declare const VALIDATOR_NAME = "forbidden-commands";
export declare const SKIP_ENV_VAR = "FORBIDDEN_COMMANDS_SKIP";
export declare const AUDIT_MODE_ENV = "FORBIDDEN_COMMANDS_AUDIT";
export declare const DOCS_REF = "AGENTS.md \"Forbidden Commands (CRITICAL)\" section";
export declare const BLOCKED_TOOLS: BlockedToolSpec[];
export declare const BLOCKED_SCRIPTS: BlockedScriptSpec[];
export declare function generateRules(): CommandRule[];
export declare const COMMAND_RULES: CommandRule[];
export declare const SUGGESTION_MODIFIERS: SuggestionModifier[];
/**
 * Split a shell command string on top-level operators (&&, ||, |, ;) while
 * correctly skipping operators that appear inside:
 *   - single-quoted strings:  '...'
 *   - double-quoted strings:  "..."
 *   - $(...) command substitutions (handles nesting)
 *   - backtick subshells: `...`
 *
 * This prevents heredoc or subshell content from being mistaken for real
 * command segments (e.g. git commit -m "$(cat <<'EOF'\n...&&...\nEOF\n)").
 */
export declare function splitTopLevelCommands(command: string): string[];
export declare function findMatchingRule(command: string): CommandRule | undefined;
export declare function applySuggestionModifiers(command: string, rule: CommandRule): string;
export declare function getApprovedEquivalent(command: string): string;
export declare function getCommandVariants(command: string): string[];
export declare function getCommandCategory(command: string): CommandCategory;
export declare function createBlockedResult(command: string, rule: CommandRule, options?: RedirectOptions): BlockedCommandResult;
export declare function createAuditResult(command: string, rule: CommandRule, options?: RedirectOptions): BlockedCommandResult;
export declare function validateForbiddenCommands(input: ToolInput): ValidationResult | BlockedCommandResult;
export {};
//# sourceMappingURL=forbidden-commands.d.ts.map