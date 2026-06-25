import { escapeRegex } from "#utils/string";

export const TASK_HEADING_PREFIX_PATTERN = "(?:\\[[^\\]]+\\]\\s+)?";
export const TASK_ID_PATTERN = "\\d+(?:\\.\\d+)+";

export function taskHeadingPatternSource(taskIdPattern: string = TASK_ID_PATTERN): string {
  return `####\\s+${TASK_HEADING_PREFIX_PATTERN}Task\\s+(${taskIdPattern}):\\s*(.+)`;
}

export function buildTaskHeadingRegex(flags = "gm"): RegExp {
  return new RegExp(`^${taskHeadingPatternSource()}$`, flags);
}

export function buildTaskHeaderRegexForId(taskId: string, flags = "m"): RegExp {
  return new RegExp(
    `^####\\s+${TASK_HEADING_PREFIX_PATTERN}Task\\s+${escapeRegex(taskId)}:`,
    flags,
  );
}

export function buildTaskSectionBoundaryRegex(flags = "m"): RegExp {
  return new RegExp(`^(?:####\\s+${TASK_HEADING_PREFIX_PATTERN}Task|###\\s+Phase)`, flags);
}

export function isTaskHeaderLine(line: string): boolean {
  return buildTaskHeadingRegex("m").test(line);
}
