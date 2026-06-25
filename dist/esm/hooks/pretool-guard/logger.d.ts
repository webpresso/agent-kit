export type LogStatus = "PASS" | "BLOCK" | "WARN" | "ERROR";
export type ToolType = "Bash" | "Write" | "Edit";
export interface LogEntry {
    status: LogStatus;
    target: string;
    tool: ToolType;
    failures?: string[];
    error?: string;
}
export interface LogConfig {
    logDir: string;
    logFile: string;
    enabled: boolean;
    maxLines: number;
}
export interface ParsedLogLine {
    timestamp: string;
    status: LogStatus;
    tool: ToolType;
    target: string;
    failures?: string[];
    error?: string;
}
export declare function createLogConfig(): LogConfig;
export declare function formatLogLine(entry: LogEntry, timestamp: string): string;
export declare function parseLogLine(line: string): ParsedLogLine | null;
export declare function rotateLines(lines: string[], maxLines: number): string[];
export declare function readLogLines(logFile: string): string[];
export declare function writeLogLines(logFile: string, logDir: string, lines: string[]): void;
export declare function logRun(entry: LogEntry, config?: LogConfig): void;
export declare function readLogs(config?: LogConfig): ParsedLogLine[];
//# sourceMappingURL=logger.d.ts.map