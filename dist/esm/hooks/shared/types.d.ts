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
//# sourceMappingURL=types.d.ts.map