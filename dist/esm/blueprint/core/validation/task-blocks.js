import { z } from 'zod';
import { executionBackendSchema } from '#types/execution-backend';
const TASK_HEADING_REGEX = /^####\s+Task\s+(\d+\.\d+):/;
/**
 * Zod schema for optional TASK-level frontmatter fields.
 *
 * - `runners`: optional list of execution backend ids; absent/empty means all runners allowed.
 * - `permissions`: access level the task requires; defaults to `'workspace-write'` when absent.
 */
export const taskFrontmatterSchema = z.object({
    runners: executionBackendSchema.array().optional(),
    permissions: z.enum(['read', 'workspace-write']).default('workspace-write'),
});
export function parseTaskBlocks(markdown) {
    const taskBlocks = [];
    const lines = markdown.split('\n');
    let currentTaskId = null;
    let currentBlock = '';
    function finalizeBlock(taskId, block) {
        taskBlocks.push({ taskId, block });
    }
    for (const line of lines) {
        const taskMatch = TASK_HEADING_REGEX.exec(line);
        if (taskMatch?.[1]) {
            if (currentTaskId !== null) {
                finalizeBlock(currentTaskId, currentBlock);
            }
            currentTaskId = taskMatch[1];
            currentBlock = `${line}\n`;
            continue;
        }
        if (currentTaskId === null) {
            continue;
        }
        if (/^#{1,3}\s/.test(line) && !line.startsWith('####')) {
            finalizeBlock(currentTaskId, currentBlock);
            currentTaskId = null;
            currentBlock = '';
            continue;
        }
        currentBlock += `${line}\n`;
    }
    if (currentTaskId !== null) {
        finalizeBlock(currentTaskId, currentBlock);
    }
    return taskBlocks;
}
//# sourceMappingURL=task-blocks.js.map