import { closeSync, copyFileSync, existsSync, fdatasyncSync, fsyncSync, openSync, renameSync, rmSync, writeFileSync, } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
export function writeJsonFile(path, data, options = {}) {
    const indent = options.indent ?? 2;
    const trailingNewline = options.trailingNewline ?? true;
    const spacing = indent === 0 ? undefined : indent;
    const text = JSON.stringify(data, null, spacing);
    const content = `${text}${trailingNewline ? "\n" : ""}`;
    if (options.atomic === true) {
        writeFileAtomic(path, content, options.writeFileOptions);
        return;
    }
    writeFileSync(path, content, options.writeFileOptions);
}
export function writeJsonFileAtomic(path, data, options = {}) {
    writeJsonFile(path, data, { ...options, atomic: true });
}
/**
 * Atomically replace `path` with `content` via write-temp → fdatasync → rename.
 *
 * The temp file is created beside the destination so the rename is normally
 * same-filesystem and atomic. On a same-filesystem rename the parent directory
 * is also fsync'd to persist the rename entry.
 *
 * If a platform reports a cross-device rename (`EXDEV`), we fall back to
 * copy+unlink and emit a warning. This path is best-effort and non-atomic —
 * a reader can observe a partial file. The directory fsync after copy does NOT
 * make this path crash-safe; it only persists the copy's directory entry.
 *
 * On write, sync, or rename failure, the temporary file is removed before the
 * error is rethrown.
 */
export function writeFileAtomic(path, content, options) {
    const tmpPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
    const normalized = normalizeWriteFileOptions(options);
    let fd = null;
    let installed = false;
    try {
        fd = openSync(tmpPath, "w", normalized.mode);
        writeFileSync(fd, content, normalized.writeOptions);
        fdatasyncSync(fd);
        closeSync(fd);
        fd = null;
        try {
            atomicFileOps.renameSync(tmpPath, path);
        }
        catch (error) {
            if (!isCrossDeviceRenameError(error))
                throw error;
            process.stderr.write(`[writeFileAtomic] warning: atomic rename failed across devices for ${path}; falling back to copy+unlink\n`);
            atomicFileOps.copyFileSync(tmpPath, path);
            rmSync(tmpPath, { force: true });
        }
        installed = true;
        atomicFileOps.fsyncDir(dirname(path));
    }
    finally {
        if (fd !== null)
            closeSync(fd);
        if (!installed && existsSync(tmpPath))
            rmSync(tmpPath, { force: true });
    }
}
function normalizeWriteFileOptions(options) {
    if (typeof options === "string" || options === null || options === undefined) {
        return { mode: undefined, writeOptions: options };
    }
    const { mode, flag: _flag, ...writeOptions } = options;
    return { mode, writeOptions };
}
function isCrossDeviceRenameError(error) {
    if (error === null || typeof error !== "object")
        return false;
    const code = error.code;
    return code === "EXDEV";
}
function isUnsupportedDirFsync(error) {
    if (error === null || typeof error !== "object")
        return false;
    const code = error.code;
    // Windows (EPERM/EINVAL) and some platforms do not support fsync on directories.
    return code === "EPERM" || code === "EINVAL" || code === "EISDIR";
}
function fsyncDir(dir) {
    let dirFd = null;
    try {
        dirFd = openSync(dir, "r");
        fsyncSync(dirFd);
    }
    catch (error) {
        if (!isUnsupportedDirFsync(error))
            throw error;
        process.stderr.write(`[writeFileAtomic] warning: directory fsync skipped for ${dir} (unsupported on this platform)\n`);
    }
    finally {
        if (dirFd !== null)
            closeSync(dirFd);
    }
}
const DEFAULT_ATOMIC_FILE_OPS = { copyFileSync, renameSync, fsyncDir };
let atomicFileOps = DEFAULT_ATOMIC_FILE_OPS;
export function _setAtomicFileOpsForTests(overrides) {
    atomicFileOps = { ...DEFAULT_ATOMIC_FILE_OPS, ...overrides };
}
export function _resetAtomicFileOpsForTests() {
    atomicFileOps = DEFAULT_ATOMIC_FILE_OPS;
}
//# sourceMappingURL=write-json-file.js.map