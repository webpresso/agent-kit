import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { getSurfacePath } from '#paths/state-root.js';
const DEFAULT_MAX_LINES = 250;
export function createLogConfig() {
    try {
        const logFile = process.env.PRETOOL_LOG_DIR
            ? `${process.env.PRETOOL_LOG_DIR}/pretool-guard.log`
            : getSurfacePath('hooks/worktree/pretool-guard.log', 'worktree');
        return {
            logDir: dirname(logFile),
            logFile,
            enabled: process.env.PRETOOL_LOG !== '0',
            maxLines: DEFAULT_MAX_LINES,
        };
    }
    catch {
        return { logDir: '', logFile: '', enabled: false, maxLines: DEFAULT_MAX_LINES };
    }
}
export function formatLogLine(entry, timestamp) {
    const failures = entry.failures?.length ? ` failures=[${entry.failures.join(',')}]` : '';
    const error = entry.error ? ` error="${entry.error.slice(0, 100)}"` : '';
    return `${timestamp} ${entry.status} ${entry.tool} target="${entry.target}"${failures}${error}`;
}
export function parseLogLine(line) {
    const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+(PASS|BLOCK|WARN|ERROR)\s+(Bash|Write|Edit)\s+target="([^"]*)"(?:\s+failures=\[([^\]]*)\])?(?:\s+error="([^"]*)")?$/);
    if (!match)
        return null;
    const [, timestamp, status, tool, target, failuresStr, error] = match;
    if (!timestamp || !status || !tool || target === undefined)
        return null;
    return {
        timestamp,
        status: status,
        tool: tool,
        target,
        failures: failuresStr ? failuresStr.split(',').filter(Boolean) : undefined,
        error: error || undefined,
    };
}
export function rotateLines(lines, maxLines) {
    if (lines.length <= maxLines)
        return lines;
    return lines.slice(-maxLines);
}
export function readLogLines(logFile) {
    if (!existsSync(logFile))
        return [];
    try {
        return readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
    }
    catch {
        return [];
    }
}
export function writeLogLines(logFile, logDir, lines) {
    if (!existsSync(logDir))
        mkdirSync(logDir, { recursive: true });
    writeFileSync(logFile, `${lines.join('\n')}\n`);
}
export function logRun(entry, config = createLogConfig()) {
    if (!config.enabled)
        return;
    try {
        const timestamp = new Date().toISOString();
        const line = formatLogLine(entry, timestamp);
        let lines = readLogLines(config.logFile);
        lines.push(line);
        lines = rotateLines(lines, config.maxLines);
        writeLogLines(config.logFile, config.logDir, lines);
    }
    catch {
        // Never block the hook on logging errors
    }
}
export function readLogs(config = createLogConfig()) {
    return readLogLines(config.logFile)
        .map(parseLogLine)
        .filter((e) => e !== null);
}
//# sourceMappingURL=logger.js.map