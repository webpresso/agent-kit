import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { spawn } from "node:child_process";

import { applyOutputTransform, type Failure, type TransformResult } from "#output-transforms/index";
import { createSessionElisionRecorder } from "#mcp/_session-elision.js";
import { buildRuntimeProcessEnv, resolveRuntimeEnvironment } from "#runtime/index.js";
import {
  exitCodeFromSignal,
  forceKillProcessTree,
  killProcessTree,
  PROCESS_TREE_FORCE_KILL_GRACE_MS,
} from "#shared-utils/process-supervisor.js";

import { createCliLogSink, type CliLogCommandName, type CliLogEntry } from "./quality-log-store.js";

export interface CliSpawnCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly runtimeProfile?: string;
}

export interface CliRunCommandOptions {
  readonly commandName: CliLogCommandName;
  readonly commands: readonly CliSpawnCommand[];
  readonly cwd?: string;
  readonly preambleLines?: readonly string[];
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly summary: (result: {
    readonly exitCode: number;
    readonly timedOut: boolean;
    readonly aborted: boolean;
  }) => string;
  readonly metadataOptions?: Record<string, unknown>;
}

export interface CliRunCommandResult {
  readonly exitCode: number;
  readonly timedOut: boolean;
  readonly aborted: boolean;
  readonly entry: CliLogEntry;
}

export async function runCliCommandSequence(
  options: CliRunCommandOptions,
): Promise<CliRunCommandResult> {
  const sink = createCliLogSink(options.commandName, options.cwd);
  for (const line of options.preambleLines ?? []) {
    sink.write(`${line}\n`);
  }
  let exitCode = 0;
  let timedOut = false;
  let aborted = false;

  for (const command of options.commands) {
    const result = await runLoggedChildCommand(command, {
      cwd: options.cwd,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      write: (chunk) => sink.write(chunk),
    });
    exitCode = result.exitCode;
    timedOut = timedOut || result.timedOut;
    aborted = aborted || result.aborted;
    if (exitCode !== 0) break;
  }

  const entry = await sink.finalize({
    exitCode,
    summary: options.summary({ exitCode, timedOut, aborted }),
    options: options.metadataOptions,
  });

  return { exitCode, timedOut, aborted, entry };
}

export interface EmitCliCommandOutputOptions {
  readonly entry: CliLogEntry;
  readonly summary: string;
  readonly passed: boolean;
  readonly full?: boolean;
  readonly rawMode?: boolean;
  readonly toolName: string;
  readonly stdout?: Pick<typeof process.stdout, "write">;
}

export function emitCliCommandOutput(options: EmitCliCommandOutputOptions): void {
  const stdout = options.stdout ?? process.stdout;
  const rawOutput = readFileSync(options.entry.logPath, "utf8");

  if (options.full || options.rawMode) {
    stdout.write(rawOutput);
    return;
  }

  const transformed = applyOutputTransform(readTransformInput(options.entry.logPath), {
    toolName: options.toolName,
    persistOverflow: false,
    elisionRecorder: createSessionElisionRecorder({
      cwd: process.cwd(),
      sourcePrefix: options.toolName,
    }),
  });
  const lines = renderSummaryLines(options.summary, transformed, options.entry, options.passed);
  if (lines.length === 0) return;
  stdout.write(`${lines.join("\n")}\n`);
}

export interface LoggedChildResult {
  readonly exitCode: number;
  readonly timedOut: boolean;
  readonly aborted: boolean;
}

export interface LoggedChildOptions {
  readonly cwd?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly write: (chunk: string) => void;
}

export async function runLoggedChildCommand(
  command: CliSpawnCommand,
  options: LoggedChildOptions,
): Promise<LoggedChildResult> {
  return new Promise((resolve) => {
    const cwd = command.cwd ?? options.cwd ?? process.cwd();
    const env = buildChildEnv(command, cwd);
    const child = spawn(command.command, [...command.args], {
      cwd,
      env,
      detached: process.platform !== "win32",
    });

    let timedOut = false;
    let aborted = false;
    let settled = false;
    let terminationRequested = false;
    let escalationTimer: ReturnType<typeof setTimeout> | undefined;

    const requestTermination = (): void => {
      if (terminationRequested) return;
      terminationRequested = true;
      killProcessTree(child, "SIGTERM");
      if (process.platform === "win32") return;
      escalationTimer = setTimeout(() => {
        forceKillProcessTree(child);
      }, PROCESS_TREE_FORCE_KILL_GRACE_MS);
    };

    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            requestTermination();
          }, options.timeoutMs);

    const onAbort = (): void => {
      aborted = true;
      requestTermination();
    };
    if (options.signal) {
      if (options.signal.aborted) queueMicrotask(onAbort);
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }

    const cleanup = (): void => {
      if (timer) clearTimeout(timer);
      if (escalationTimer) clearTimeout(escalationTimer);
      options.signal?.removeEventListener("abort", onAbort);
    };

    const finish = (result: LoggedChildResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      options.write(chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      options.write(chunk.toString("utf8"));
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      options.write(`${error.message ?? String(error)}\n`);
      finish({
        exitCode: 1,
        timedOut,
        aborted,
      });
    });
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (terminationRequested && signal !== "SIGKILL") forceKillProcessTree(child);
      finish({
        exitCode: code ?? exitCodeFromSignal(signal),
        timedOut,
        aborted,
      });
    });
  });
}

function renderSummaryLines(
  summary: string,
  transformed: TransformResult,
  entry: CliLogEntry,
  passed: boolean,
): string[] {
  const lines: string[] = [];
  const resolvedScopeLine = formatResolvedScopeLine(entry);
  if (resolvedScopeLine) lines.push(resolvedScopeLine);
  if (summary.trim().length > 0) lines.push(summary.trim());

  const failureLines = formatFailures(transformed.failures);
  if (failureLines.length > 0) {
    lines.push(...failureLines);
  } else if (!passed && transformed.rawOutput?.trim()) {
    lines.push(transformed.rawOutput.trimEnd());
  }

  if (!passed || transformed.truncated) {
    lines.push(`Full log: wp logs ${entry.command}`);
  }
  if (transformed.elisions && transformed.elisions.length > 0) {
    lines.push(
      ...transformed.elisions.map(
        (elision) => `Retrieve elision: ${elision.retrieveTool} id=${elision.id}`,
      ),
    );
  }
  if (transformed.warnings && transformed.warnings.length > 0) {
    lines.push(...transformed.warnings.map((warning) => `Warning: ${warning}`));
  }

  return lines;
}

function formatResolvedScopeLine(entry: CliLogEntry): string | null {
  if (entry.command !== "typecheck") return null;
  const resolvedScopes = entry.options?.resolvedScopes;
  if (!Array.isArray(resolvedScopes)) return null;
  const scopeNames = resolvedScopes.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  if (scopeNames.length === 0) return null;
  return `Resolved typecheck scopes: ${scopeNames.join(", ")}`;
}

function formatFailures(failures: readonly Failure[] | undefined): string[] {
  return (failures ?? []).slice(0, 20).map((failure) => {
    const location =
      failure.file !== undefined
        ? `${failure.file}${failure.line !== undefined ? `:${failure.line}` : ""}`
        : undefined;
    const code = failure.code ? ` ${failure.code}` : "";
    return `${location ? `${location}` : ""}${code} ${failure.message}`.trim();
  });
}

function readTransformInput(
  absoluteLogPath: string,
  headBytes = 128 * 1024,
  tailBytes = 128 * 1024,
): string {
  const rawBytes = statSync(absoluteLogPath).size;
  const limit = headBytes + tailBytes;
  const fd = openSync(absoluteLogPath, "r");
  try {
    if (rawBytes <= limit) {
      return readByteRange(fd, rawBytes, 0);
    }

    const head = readByteRange(fd, headBytes, 0);
    const tail = readByteRange(fd, tailBytes, rawBytes - tailBytes);
    return `${head}\n...[truncated ${rawBytes - limit} bytes]...\n${tail}`;
  } finally {
    closeSync(fd);
  }
}

function readByteRange(fd: number, byteLength: number, position: number): string {
  const buffer = Buffer.allocUnsafe(byteLength);
  const bytesRead = readSync(fd, buffer, 0, byteLength, position);
  return buffer.subarray(0, bytesRead).toString("utf8");
}

function buildChildEnv(command: CliSpawnCommand, cwd: string): NodeJS.ProcessEnv {
  if (!command.runtimeProfile) {
    return { ...process.env, ...command.env };
  }

  const resolvedRuntime = resolveRuntimeEnvironment({
    cwd,
    profile: command.runtimeProfile,
    env: { ...process.env, ...command.env },
  });
  return buildRuntimeProcessEnv(cwd, { ...process.env, ...command.env }, resolvedRuntime);
}
