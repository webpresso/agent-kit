import { randomUUID } from "node:crypto";
import { closeSync, createWriteStream, mkdirSync, openSync, readdirSync, readFileSync, statSync, renameSync, utimesSync, rmSync, writeFileSync, } from "node:fs";
import { dirname, join } from "node:path";
import { getSurfacePath } from "#paths/state-root.js";
import { readTrustedJsonFile } from "#shared-utils/read-json-file.js";
import { shortId } from "#shared-utils/short-id.js";
import { writeJsonFile } from "#shared-utils/write-json-file.js";
export const CLI_LOG_COMMANDS = [
    "test",
    "typecheck",
    "qa",
    "audit",
    "e2e",
    "lint",
    "format",
];
const ORPHAN_LOG_GRACE_MS = 60_000;
export function isCliLogCommandName(value) {
    return CLI_LOG_COMMANDS.includes(value);
}
export function createCliLogSink(command, cwd = process.cwd()) {
    const id = createLogId();
    const commandDir = getCommandLogDir(command, cwd);
    mkdirSync(commandDir, { recursive: true });
    const absoluteLogPath = join(commandDir, `${id}.log`);
    const activeMarkerPath = getActiveMarkerPath(absoluteLogPath);
    writeFileSync(activeMarkerPath, `${process.pid}\n${new Date().toISOString()}\n`, "utf8");
    let fd;
    try {
        fd = openSync(absoluteLogPath, "a");
    }
    catch (error) {
        rmSync(activeMarkerPath, { force: true });
        throw error;
    }
    const stream = createWriteStream(absoluteLogPath, {
        encoding: "utf8",
        fd,
        flags: "a",
        autoClose: true,
    });
    let streamError;
    let rejectPendingFinalize;
    stream.on("error", (error) => {
        streamError = error;
        rejectPendingFinalize?.(error);
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
                if (streamError) {
                    reject(streamError);
                    return;
                }
                rejectPendingFinalize = reject;
                stream.end(() => {
                    rejectPendingFinalize = undefined;
                    if (streamError) {
                        reject(streamError);
                        return;
                    }
                    resolve();
                });
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
            try {
                markLogRecentlyFinalized(absoluteLogPath);
                writeLogEntry(entry, cwd);
            }
            finally {
                rmSync(activeMarkerPath, { force: true });
            }
            return entry;
        },
    };
}
export function readCliLogEntries(command, cwd = process.cwd()) {
    const indexPath = getCommandIndexPath(command, cwd);
    try {
        const parsed = readTrustedJsonFile(indexPath);
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
    withCommandIndexLock(entry.command, cwd, () => {
        const indexPath = getCommandIndexPath(entry.command, cwd);
        mkdirSync(dirname(indexPath), { recursive: true });
        const currentEntries = readCliLogEntries(entry.command, cwd).filter((current) => current.id !== entry.id);
        const nextEntries = [entry, ...currentEntries].slice(0, 10);
        const retainedLogPaths = new Set(nextEntries.map((item) => item.logPath));
        for (const removed of currentEntries.slice(9)) {
            if (!retainedLogPaths.has(removed.logPath) && canPruneLogPath(removed.logPath)) {
                rmSync(removed.logPath, { force: true });
            }
        }
        pruneInactiveOrphanedLogFiles(entry.command, retainedLogPaths, cwd);
        const index = {
            version: 1,
            command: entry.command,
            entries: nextEntries,
        };
        writeIndexAtomically(indexPath, index);
    });
}
function withCommandIndexLock(command, cwd, fn) {
    const commandDir = getCommandLogDir(command, cwd);
    mkdirSync(commandDir, { recursive: true });
    const lockPath = join(commandDir, "index.lock");
    const started = Date.now();
    let fd;
    while (fd === undefined) {
        try {
            fd = openSync(lockPath, "wx");
        }
        catch (error) {
            if (!isFileExistsError(error))
                throw error;
            if (Date.now() - started > 5_000) {
                throw new Error(`Timed out waiting for CLI log index lock: ${lockPath}`);
            }
            sleepSync(10);
        }
    }
    try {
        return fn();
    }
    finally {
        closeSync(fd);
        rmSync(lockPath, { force: true });
    }
}
function writeIndexAtomically(indexPath, index) {
    const tmpPath = `${indexPath}.${process.pid}.${randomUUID()}.tmp`;
    writeJsonFile(tmpPath, index);
    renameSync(tmpPath, indexPath);
}
function pruneInactiveOrphanedLogFiles(command, retainedLogPaths, cwd) {
    const directory = getCommandLogDir(command, cwd);
    mkdirSync(directory, { recursive: true });
    for (const file of readdirSync(directory)) {
        if (!file.endsWith(".log"))
            continue;
        const absolutePath = join(directory, file);
        if (!retainedLogPaths.has(absolutePath) && canPruneLogPath(absolutePath)) {
            rmSync(absolutePath, { force: true });
        }
    }
}
function markLogRecentlyFinalized(logPath) {
    const now = new Date();
    try {
        utimesSync(logPath, now, now);
    }
    catch (error) {
        if (!isMissingFileError(error))
            throw error;
        mkdirSync(dirname(logPath), { recursive: true });
        writeFileSync(logPath, "", { flag: "a" });
        utimesSync(logPath, now, now);
    }
}
function canPruneLogPath(logPath) {
    if (isActiveLogPath(logPath))
        return false;
    try {
        return Date.now() - statSync(logPath).mtimeMs > ORPHAN_LOG_GRACE_MS;
    }
    catch {
        return false;
    }
}
function isActiveLogPath(logPath) {
    try {
        readFileSync(getActiveMarkerPath(logPath), "utf8");
        return true;
    }
    catch {
        return false;
    }
}
function getActiveMarkerPath(logPath) {
    return `${logPath}.active`;
}
function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function isFileExistsError(error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
function isMissingFileError(error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function getCommandLogDir(command, cwd) {
    return getSurfacePath(join("cli-logs", command), "repo", cwd);
}
function getCommandIndexPath(command, cwd) {
    return join(getCommandLogDir(command, cwd), "index.json");
}
function createLogId(now = new Date()) {
    const iso = now.toISOString().replaceAll(":", "-").replaceAll(".", "-");
    return `${iso}-${shortId(6)}`;
}
//# sourceMappingURL=quality-log-store.js.map