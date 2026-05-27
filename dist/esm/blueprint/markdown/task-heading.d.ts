export declare const TASK_HEADING_PREFIX_PATTERN = "(?:\\[[^\\]]+\\]\\s+)?";
export declare const TASK_ID_PATTERN = "\\d+(?:\\.\\d+)+";
export declare function taskHeadingPatternSource(taskIdPattern?: string): string;
export declare function buildTaskHeadingRegex(flags?: string): RegExp;
export declare function buildTaskHeaderRegexForId(taskId: string, flags?: string): RegExp;
export declare function buildTaskSectionBoundaryRegex(flags?: string): RegExp;
export declare function isTaskHeaderLine(line: string): boolean;
//# sourceMappingURL=task-heading.d.ts.map