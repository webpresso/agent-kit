import { getContent, getFilePath } from '../../shared/types.js';
import { createSkipResult } from './skip-result.js';
const MAX_COMMAND_LINES = 600;
const MAX_SKILL_LINES = 400;
export function validateCommandFile(input) {
    if (process.env.COMMAND_FILE_SKIP === '1')
        return createSkipResult('command-file');
    const filePath = getFilePath(input);
    const content = getContent(input);
    if (!filePath || !content)
        return { validator: 'command-file', passed: true };
    const normalized = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const lines = content.split('\n').length;
    if (normalized.includes('.claude/commands/')) {
        if (lines > MAX_COMMAND_LINES) {
            return {
                validator: 'command-file',
                passed: false,
                message: `Command file exceeds ${MAX_COMMAND_LINES} lines (${lines}). Split into smaller commands.`,
            };
        }
        return { validator: 'command-file', passed: true };
    }
    if (normalized.includes('.claude/skills/')) {
        if (lines > MAX_SKILL_LINES) {
            return {
                validator: 'command-file',
                passed: false,
                message: `Skill file exceeds ${MAX_SKILL_LINES} lines (${lines}). Simplify the skill.`,
            };
        }
        return { validator: 'command-file', passed: true };
    }
    return { validator: 'command-file', passed: true };
}
//# sourceMappingURL=command-file.js.map