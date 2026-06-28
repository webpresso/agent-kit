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
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, } from "node:fs";
import { dirname } from "node:path";
import { getSurfacePath } from "#paths/state-root.js";
export const MAX_LINES = 500;
export const ROTATE_KEEP = 250;
export const STACK_TRUNCATE = 500;
/**
 * Best-effort logger for auto-update flow errors. Sync (append happens before
 * the parent process exits), never throws, never returns a value.
 */
export function logUpdateError(err) {
    try {
        const entry = buildEntry(err);
        const logFile = resolveLogFile();
        if (logFile === null)
            return;
        appendEntry(logFile, entry);
        rotateIfNeeded(logFile);
    }
    catch {
        // Best-effort: never propagate logging failure to the parent.
    }
}
/**
 * Convert an unknown thrown value into the canonical log entry shape.
 * Exported for testing — pure (no I/O).
 */
export function buildEntry(err, now = new Date()) {
    const ts = now.toISOString();
    if (err instanceof Error) {
        const stack = err.stack ? err.stack.slice(0, STACK_TRUNCATE) : undefined;
        return { ts, level: "error", message: err.message, stack };
    }
    if (typeof err === "string") {
        return { ts, level: "error", message: err };
    }
    return { ts, level: "error", message: safeStringify(err) };
}
/**
 * Format a log entry as a single JSON line (newline terminated).
 * Exported for testing — pure.
 */
export function formatLine(entry) {
    return `${JSON.stringify(entry)}\n`;
}
/**
 * Apply rotation policy to an array of lines. If lines exceeds MAX_LINES,
 * keep only the last ROTATE_KEEP. Exported for testing — pure.
 */
export function rotateLines(lines) {
    if (lines.length <= MAX_LINES)
        return lines;
    return lines.slice(-ROTATE_KEEP);
}
function resolveLogFile() {
    try {
        return getSurfacePath("auto-update.log", "user");
    }
    catch {
        return null;
    }
}
function appendEntry(logFile, entry) {
    const dir = dirname(logFile);
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    appendFileSync(logFile, formatLine(entry));
}
function rotateIfNeeded(logFile) {
    if (!existsSync(logFile))
        return;
    // Cheap early-out — only read+rewrite when the file has grown beyond budget.
    const size = statSync(logFile).size;
    // Each JSON line averages ≥40 bytes; ignore rotation work below that threshold.
    if (size < MAX_LINES * 40)
        return;
    const content = readFileSync(logFile, "utf-8");
    const lines = content.split("\n").filter((line) => line.length > 0);
    if (lines.length <= MAX_LINES)
        return;
    const kept = rotateLines(lines);
    writeFileSync(logFile, `${kept.join("\n")}\n`);
}
function safeStringify(value) {
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
//# sourceMappingURL=log.js.map