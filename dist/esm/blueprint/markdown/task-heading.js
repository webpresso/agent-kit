import { escapeRegex } from '#utils/string';
export const TASK_HEADING_PREFIX_PATTERN = '(?:\\[[^\\]]+\\]\\s+)?';
export const TASK_ID_PATTERN = '\\d+(?:\\.\\d+)+';
export function taskHeadingPatternSource(taskIdPattern = TASK_ID_PATTERN) {
    return `####\\s+${TASK_HEADING_PREFIX_PATTERN}Task\\s+(${taskIdPattern}):\\s*(.+)`;
}
export function buildTaskHeadingRegex(flags = 'gm') {
    return new RegExp(`^${taskHeadingPatternSource()}$`, flags);
}
export function buildTaskHeaderRegexForId(taskId, flags = 'm') {
    return new RegExp(`^####\\s+${TASK_HEADING_PREFIX_PATTERN}Task\\s+${escapeRegex(taskId)}:`, flags);
}
export function buildTaskSectionBoundaryRegex(flags = 'm') {
    return new RegExp(`^(?:####\\s+${TASK_HEADING_PREFIX_PATTERN}Task|###\\s+Phase)`, flags);
}
export function isTaskHeaderLine(line) {
    return buildTaskHeadingRegex('m').test(line);
}
//# sourceMappingURL=task-heading.js.map