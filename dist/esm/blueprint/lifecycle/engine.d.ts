import type { Blueprint } from '#core/parser';
import type { LifecycleBlueprintStatus } from '#core/schema';
export type LifecycleTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type BlueprintLifecycleIntent = {
    type: 'start';
} | {
    type: 'park';
} | {
    type: 'finalize';
} | {
    type: 'task_start';
    taskId: string;
} | {
    type: 'task_block';
    taskId: string;
    reason: string;
} | {
    type: 'task_unblock';
    taskId: string;
} | {
    type: 'task_complete';
    taskId: string;
};
export interface BlueprintLifecycleResult {
    auditEvents: string[];
    blueprint: Blueprint;
    markdown: string;
    progress: string;
    targetStatus: LifecycleBlueprintStatus;
}
export declare function setBlueprintFrontmatterFields(markdown: string, updates: Record<string, string | string[] | undefined>): string;
export declare function applyBlueprintLifecycle(markdown: string, slug: string, intent: BlueprintLifecycleIntent): BlueprintLifecycleResult;
//# sourceMappingURL=engine.d.ts.map