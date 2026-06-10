export interface ToolInput {
    session_id?: string;
    transcript_path?: string;
    cwd?: string;
    hook_event_name?: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
}
export interface ValidationResult {
    validator: string;
    passed: boolean;
    message?: string;
    skipped?: boolean;
    skipReason?: string;
}
export declare function parseToolInput(json: string): ToolInput;
export declare function isBashInput(input: ToolInput): boolean;
export declare function isFileEditInput(input: ToolInput): boolean;
export declare function isFileWriteInput(input: ToolInput): boolean;
export declare function isFileReadInput(input: ToolInput): boolean;
export declare function getFilePath(input: ToolInput): string | undefined;
export declare function getCommand(input: ToolInput): string | undefined;
export declare function getContent(input: ToolInput): string | undefined;
/**
 * The shape of a deny envelope emitted to stdout by pretool-guard.
 * Must be valid JSON on stdout (Claude Code / Codex PreToolUse requirement).
 */
export type DenyEnvelope = {
    readonly hookSpecificOutput: {
        readonly hookEventName: 'PreToolUse';
        readonly permissionDecision: 'deny';
        /** SHORT user-facing reason (≤80 chars) */
        readonly permissionDecisionReason: string;
    };
};
/** Build a policy deny envelope. */
export declare function buildDenyEnvelope(options: {
    readonly reason: string;
}): DenyEnvelope;
//# sourceMappingURL=types.d.ts.map