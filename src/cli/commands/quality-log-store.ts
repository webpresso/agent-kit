import { randomUUID } from "node:crypto";
import {
  closeSync,
  createWriteStream,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  renameSync,
  utimesSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
] as const;

const ORPHAN_LOG_GRACE_MS = 60_000;

export type CliLogCommandName = (typeof CLI_LOG_COMMANDS)[number];

export interface CliLogEntry {
  readonly id: string;
  readonly command: CliLogCommandName;
  readonly timestamp: string;
  readonly exitCode: number;
  readonly logPath: string;
  readonly options?: Record<string, unknown>;
  readonly summary?: string;
}

interface CliLogIndex {
  readonly version: 1;
  readonly command: CliLogCommandName;
  readonly entries: readonly CliLogEntry[];
}

export function isCliLogCommandName(value: string): value is CliLogCommandName {
  return (CLI_LOG_COMMANDS as readonly string[]).includes(value);
}

export function createCliLogSink(command: CliLogCommandName, cwd = process.cwd()): CliLogSink {
  const id = createLogId();
  const commandDir = getCommandLogDir(command, cwd);
  mkdirSync(commandDir, { recursive: true });
  const absoluteLogPath = join(commandDir, `${id}.log`);
  const activeMarkerPath = getActiveMarkerPath(absoluteLogPath);
  writeFileSync(activeMarkerPath, `${process.pid}\n${new Date().toISOString()}\n`, "utf8");

  let fd: number;
  try {
    fd = openSync(absoluteLogPath, "a");
  } catch (error) {
    rmSync(activeMarkerPath, { force: true });
    throw error;
  }

  const stream = createWriteStream(absoluteLogPath, {
    encoding: "utf8",
    fd,
    flags: "a",
    autoClose: true,
  });
  let streamError: Error | undefined;
  let rejectPendingFinalize: ((error: Error) => void) | undefined;
  stream.on("error", (error: Error) => {
    streamError = error;
    rejectPendingFinalize?.(error);
  });

  return {
    command,
    cwd,
    id,
    absoluteLogPath,
    write(chunk: string): void {
      stream.write(chunk);
    },
    async finalize(metadata): Promise<CliLogEntry> {
      await new Promise<void>((resolve, reject) => {
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
      const entry: CliLogEntry = {
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
      } finally {
        rmSync(activeMarkerPath, { force: true });
      }
      return entry;
    },
  };
}

export interface CliLogSink {
  readonly command: CliLogCommandName;
  readonly cwd: string;
  readonly id: string;
  readonly absoluteLogPath: string;
  write(chunk: string): void;
  finalize(metadata: {
    readonly exitCode: number;
    readonly summary?: string;
    readonly options?: Record<string, unknown>;
    readonly timestamp?: string;
  }): Promise<CliLogEntry>;
}

export function readCliLogEntries(
  command: CliLogCommandName,
  cwd = process.cwd(),
): readonly CliLogEntry[] {
  const indexPath = getCommandIndexPath(command, cwd);
  try {
    const parsed = readTrustedJsonFile<CliLogIndex>(indexPath);
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

export function readCliLogEntry(
  command: CliLogCommandName,
  ordinal = 1,
  cwd = process.cwd(),
): CliLogEntry | undefined {
  if (!Number.isInteger(ordinal) || ordinal < 1) return;
  return readCliLogEntries(command, cwd)[ordinal - 1];
}

function writeLogEntry(entry: CliLogEntry, cwd: string): void {
  withCommandIndexLock(entry.command, cwd, () => {
    const indexPath = getCommandIndexPath(entry.command, cwd);
    mkdirSync(dirname(indexPath), { recursive: true });

    const currentEntries = readCliLogEntries(entry.command, cwd).filter(
      (current) => current.id !== entry.id,
    );
    const nextEntries = [entry, ...currentEntries].slice(0, 10);
    const retainedLogPaths = new Set(nextEntries.map((item) => item.logPath));

    for (const removed of currentEntries.slice(9)) {
      if (!retainedLogPaths.has(removed.logPath) && canPruneLogPath(removed.logPath)) {
        rmSync(removed.logPath, { force: true });
      }
    }

    pruneInactiveOrphanedLogFiles(entry.command, retainedLogPaths, cwd);

    const index: CliLogIndex = {
      version: 1,
      command: entry.command,
      entries: nextEntries,
    };
    writeIndexAtomically(indexPath, index);
  });
}

function withCommandIndexLock<T>(command: CliLogCommandName, cwd: string, fn: () => T): T {
  const commandDir = getCommandLogDir(command, cwd);
  mkdirSync(commandDir, { recursive: true });
  const lockPath = join(commandDir, "index.lock");
  const started = Date.now();
  let fd: number | undefined;

  while (fd === undefined) {
    try {
      fd = openSync(lockPath, "wx");
    } catch (error) {
      if (!isFileExistsError(error)) throw error;
      if (Date.now() - started > 5_000) {
        throw new Error(`Timed out waiting for CLI log index lock: ${lockPath}`);
      }
      sleepSync(10);
    }
  }

  try {
    return fn();
  } finally {
    closeSync(fd);
    rmSync(lockPath, { force: true });
  }
}

function writeIndexAtomically(indexPath: string, index: CliLogIndex): void {
  const tmpPath = `${indexPath}.${process.pid}.${randomUUID()}.tmp`;
  writeJsonFile(tmpPath, index);
  renameSync(tmpPath, indexPath);
}

function pruneInactiveOrphanedLogFiles(
  command: CliLogCommandName,
  retainedLogPaths: ReadonlySet<string>,
  cwd: string,
): void {
  const directory = getCommandLogDir(command, cwd);
  mkdirSync(directory, { recursive: true });
  for (const file of readdirSync(directory)) {
    if (!file.endsWith(".log")) continue;
    const absolutePath = join(directory, file);
    if (!retainedLogPaths.has(absolutePath) && canPruneLogPath(absolutePath)) {
      rmSync(absolutePath, { force: true });
    }
  }
}

function markLogRecentlyFinalized(logPath: string): void {
  const now = new Date();
  try {
    utimesSync(logPath, now, now);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    mkdirSync(dirname(logPath), { recursive: true });
    writeFileSync(logPath, "", { flag: "a" });
    utimesSync(logPath, now, now);
  }
}

function canPruneLogPath(logPath: string): boolean {
  if (isActiveLogPath(logPath)) return false;
  try {
    return Date.now() - statSync(logPath).mtimeMs > ORPHAN_LOG_GRACE_MS;
  } catch {
    return false;
  }
}

function isActiveLogPath(logPath: string): boolean {
  try {
    readFileSync(getActiveMarkerPath(logPath), "utf8");
    return true;
  } catch {
    return false;
  }
}

function getActiveMarkerPath(logPath: string): string {
  return `${logPath}.active`;
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function getCommandLogDir(command: CliLogCommandName, cwd: string): string {
  return getSurfacePath(join("cli-logs", command), "repo", cwd);
}

function getCommandIndexPath(command: CliLogCommandName, cwd: string): string {
  return join(getCommandLogDir(command, cwd), "index.json");
}

function createLogId(now = new Date()): string {
  const iso = now.toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return `${iso}-${shortId(6)}`;
}
