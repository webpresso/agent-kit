import { createWriteStream, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync, } from 'node:fs';
import { dirname, join } from 'node:path';
import { getSurfacePath } from '#paths/state-root.js';
export const CLI_LOG_COMMANDS = [
    'test',
    'typecheck',
    'qa',
    'audit',
    'e2e',
    'lint',
    'format',
];
export function isCliLogCommandName(value) {
    return CLI_LOG_COMMANDS.includes(value);
}
export function createCliLogSink(command, cwd = process.cwd()) {
    const id = createLogId();
    const commandDir = getCommandLogDir(command, cwd);
    mkdirSync(commandDir, { recursive: true });
    const absoluteLogPath = join(commandDir, `${id}.log`);
    const fd = openSync(absoluteLogPath, 'a');
    const stream = createWriteStream(absoluteLogPath, {
        encoding: 'utf8',
        fd,
        flags: 'a',
        autoClose: true,
    });
    return {
        command,
        cwd,
        id,
        absoluteLogPath,
        write(chunk) {
            stream.write(chunk);
        },
        async finalize(metadata) {
            await new Promise((resolve, reject) => {
                stream.on('error', reject);
                stream.end(() => resolve());
            });
            const entry = {
                id,
                command,
                timestamp: metadata.timestamp ?? new Date().toISOString(),
                exitCode: metadata.exitCode,
                logPath: absoluteLogPath,
                ...(metadata.options ? { options: metadata.options } : {}),
                ...(metadata.summary ? { summary: metadata.summary } : {}),
            };
            writeLogEntry(entry, cwd);
            return entry;
        },
    };
}
export function readCliLogEntries(command, cwd = process.cwd()) {
    const indexPath = getCommandIndexPath(command, cwd);
    try {
        const parsed = JSON.parse(readFileSync(indexPath, 'utf8'));
        return Array.isArray(parsed.entries) ? parsed.entries : [];
    }
    catch {
        return [];
    }
}
export function readCliLogEntry(command, ordinal = 1, cwd = process.cwd()) {
    if (!Number.isInteger(ordinal) || ordinal < 1)
        return;
    return readCliLogEntries(command, cwd)[ordinal - 1];
}
function writeLogEntry(entry, cwd) {
    const indexPath = getCommandIndexPath(entry.command, cwd);
    mkdirSync(dirname(indexPath), { recursive: true });
    const currentEntries = readCliLogEntries(entry.command, cwd);
    const nextEntries = [entry, ...currentEntries].slice(0, 10);
    const retainedLogPaths = new Set(nextEntries.map((item) => item.logPath));
    for (const removed of currentEntries.slice(9)) {
        if (!retainedLogPaths.has(removed.logPath)) {
            rmSync(removed.logPath, { force: true });
        }
    }
    pruneOrphanedLogFiles(entry.command, retainedLogPaths, cwd);
    const index = {
        version: 1,
        command: entry.command,
        entries: nextEntries,
    };
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}
function pruneOrphanedLogFiles(command, retainedLogPaths, cwd) {
    const directory = getCommandLogDir(command, cwd);
    mkdirSync(directory, { recursive: true });
    for (const file of readdirSync(directory)) {
        if (!file.endsWith('.log'))
            continue;
        const absolutePath = join(directory, file);
        if (!retainedLogPaths.has(absolutePath)) {
            rmSync(absolutePath, { force: true });
        }
    }
}
function getCommandLogDir(command, cwd) {
    return getSurfacePath(join('cli-logs', command), 'repo', cwd);
}
function getCommandIndexPath(command, cwd) {
    return join(getCommandLogDir(command, cwd), 'index.json');
}
function createLogId(now = new Date()) {
    const iso = now.toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const entropy = Math.random().toString(36).slice(2, 8);
    return `${iso}-${entropy}`;
}
//# sourceMappingURL=quality-log-store.js.map