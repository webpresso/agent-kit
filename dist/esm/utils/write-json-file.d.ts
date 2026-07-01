import { copyFileSync, renameSync, type WriteFileOptions } from "node:fs";
export interface WriteJsonFileOptions {
    readonly indent?: number;
    readonly trailingNewline?: boolean;
    readonly writeFileOptions?: WriteFileOptions;
    readonly atomic?: boolean;
}
export declare function writeJsonFile(path: string, data: unknown, options?: WriteJsonFileOptions): void;
export declare function writeJsonFileAtomic(path: string, data: unknown, options?: Omit<WriteJsonFileOptions, "atomic">): void;
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
export declare function writeFileAtomic(path: string, content: string | NodeJS.ArrayBufferView, options?: WriteFileOptions): void;
declare function fsyncDir(dir: string): void;
declare const DEFAULT_ATOMIC_FILE_OPS: {
    copyFileSync: typeof copyFileSync;
    renameSync: typeof renameSync;
    fsyncDir: typeof fsyncDir;
};
export declare function _setAtomicFileOpsForTests(overrides: Partial<typeof DEFAULT_ATOMIC_FILE_OPS>): void;
export declare function _resetAtomicFileOpsForTests(): void;
export {};
//# sourceMappingURL=write-json-file.d.ts.map