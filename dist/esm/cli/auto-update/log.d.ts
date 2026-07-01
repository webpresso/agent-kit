/**
 * Auto-update error log.
 *
 * Append-only JSON-line log at `<state-root>/auto-update.log`. Used as the
 * sink for `runUpdateFlow(...).catch(logUpdateError)` (per plan D13). Never
 * throws — failures inside the logger are intentionally silent because the
 * logger is itself the error handler of last resort.
 *
 * Each entry is a single JSON object on its own line:
 *   { ts, level, message, stack? }
 *
 * The stack is truncated to 500 characters so a single rogue entry can't
 * blow out the file budget. The file is rotated when it crosses 500 lines:
 * the most recent 250 are kept, the rest dropped.
 */
export type LogLevel = "error" | "warn" | "info";
export interface LogEntry {
    ts: string;
    level: LogLevel;
    message: string;
    stack?: string;
}
export declare const MAX_LINES = 500;
export declare const ROTATE_KEEP = 250;
export declare const STACK_TRUNCATE = 500;
/**
 * Best-effort logger for auto-update flow errors. Sync (append happens before
 * the parent process exits), never throws, never returns a value.
 */
export declare function logUpdateError(err: unknown): void;
/**
 * Convert an unknown thrown value into the canonical log entry shape.
 * Exported for testing — pure (no I/O).
 */
export declare function buildEntry(err: unknown, now?: Date): LogEntry;
/**
 * Format a log entry as a single JSON line (newline terminated).
 * Exported for testing — pure.
 */
export declare function formatLine(entry: LogEntry): string;
/**
 * Apply rotation policy to an array of lines. If lines exceeds MAX_LINES,
 * keep only the last ROTATE_KEEP. Exported for testing — pure.
 */
export declare function rotateLines(lines: string[]): string[];
//# sourceMappingURL=log.d.ts.map