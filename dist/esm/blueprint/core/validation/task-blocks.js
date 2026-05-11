const TASK_HEADING_REGEX = /^####\s+Task\s+(\d+\.\d+):/;
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