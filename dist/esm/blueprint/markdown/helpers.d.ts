/**
 * Plan Markdown Helpers
 *
 * Pure functions for patching markdown plan files.
 * Used by AgentBlueprintContext for task status updates.
 *
 * All functions are idempotent - running them multiple times
 * produces identical output (for the same inputs).
 */
export declare function extractCodeBlocks(content: string, language: string): string[];
export declare function extractTaskSection(raw: string, taskId: string): string | null;
export declare function checkFirstCheckbox(content: string, taskId: string): string;
export declare function checkAllCheckboxes(content: string, taskId: string): string;
export declare function completeTask(content: string, taskId: string): string;
export declare function updateBlockedReason(content: string, taskId: string, reason: string): string;
export declare function updateTaskStatus(content: string, taskId: string, status: 'todo' | 'in_progress' | 'blocked' | 'done'): string;
//# sourceMappingURL=helpers.d.ts.map