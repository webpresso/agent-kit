#!/usr/bin/env bun
import { globSync } from "glob";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";

import { runHook } from "#hooks/shared/hook-bootstrap";
import { isLintableFile, isSkippedPath } from "#hooks/post-tool/lint-after-edit";
import { isDirectEntrypoint } from "#hooks/shared/direct-entrypoint";
import { getSurfacePath, NotInGitRepoError } from "#paths/state-root.js";
import { buildContinuityEvent } from "#session-memory/hook-capture.js";
import { repoHashFromRoot } from "#session-memory/repo-hash.js";
import { SessionMemorySessionStore } from "#session-memory/session.js";

const TYPECHECKABLE_EXTENSIONS = new Set([".ts", ".tsx"]);
const DEFAULT_MAX_CHANGED_FILES = 20;
const DEFAULT_MAX_SUMMARY_BYTES = 2048;

type EnvLike = Record<string, string | undefined>;

type StopHookInput = {
  readonly agent_id?: string;
  readonly agent_type?: string;
  readonly assistant_message?: string;
  readonly changed_files?: unknown;
  readonly changedFiles?: unknown;
  readonly cwd?: string;
  readonly hook_event_name?: string;
  readonly last_assistant_message?: string;
  readonly message?: string;
  readonly response?: string;
  readonly session_id?: string;
  readonly transcript_path?: string | null;
  readonly turn_id?: string;
};

export type StopHookOutput = Record<string, never>;

export interface StopCaptureDeps {
  readonly createStore?: (
    dbPath: string,
  ) => Pick<SessionMemorySessionStore, "captureEvent" | "close">;
  readonly dbPath?: string;
  readonly getChangedFiles?: (projectDir: string) => string[];
  readonly now?: () => Date;
  readonly repoHash?: (projectDir: string) => string;
  readonly runQaChecks?: (qaFiles: string[], projectDir: string) => string[];
}

export function getChangedFiles(projectDir: string): string[] {
  const unstaged = execSync("git diff --name-only", { cwd: projectDir, encoding: "utf-8" }).trim();
  const staged = execSync("git diff --cached --name-only", {
    cwd: projectDir,
    encoding: "utf-8",
  }).trim();
  const all = new Set<string>();
  for (const line of unstaged.split("\n")) if (line) all.add(line);
  for (const line of staged.split("\n")) if (line) all.add(line);
  return [...all];
}

function safeGetChangedFiles(
  projectDir: string,
  getFiles: (projectDir: string) => string[],
): { files: string[]; degraded: boolean } {
  try {
    return { files: getFiles(projectDir), degraded: false };
  } catch {
    return { files: [], degraded: true };
  }
}

export function filterQaFiles(files: string[]): string[] {
  return files.filter((f) => isLintableFile(f) && !isSkippedPath(f));
}

export function getTypecheckFiles(files: string[]): string[] {
  return files.filter((f) => TYPECHECKABLE_EXTENSIONS.has(extname(f)));
}

export function findTestFiles(sourceFile: string, projectDir: string): string[] {
  const ext = extname(sourceFile);
  const base = basename(sourceFile, ext);
  const dir = dirname(sourceFile);
  if (base.endsWith(".test") || base.endsWith(".integration.test")) return [sourceFile];
  const pattern = join(dir, `${base}.{test,integration.test}{.ts,.tsx}`);
  return globSync(pattern, { cwd: projectDir });
}

export function discoverTestFiles(changedFiles: string[], projectDir: string): string[] {
  const testFiles = new Set<string>();
  for (const file of changedFiles) {
    for (const testFile of findTestFiles(file, projectDir)) testFiles.add(testFile);
  }
  return [...testFiles];
}

export function buildTypecheckCommand(files: string[]): string | null {
  if (files.length === 0) return null;
  return `just typecheck ${files.map((f) => `--file '${f}'`).join(" ")}`;
}

export function buildTestCommand(files: string[]): string | null {
  if (files.length === 0) return null;
  return `just test ${files.map((f) => `--file '${f}'`).join(" ")}`;
}

function runCommand(cmd: string, projectDir: string): { success: boolean; stderr: string } {
  try {
    execSync(cmd, { cwd: projectDir, stdio: ["pipe", "pipe", "pipe"], encoding: "utf-8" });
    return { success: true, stderr: "" };
  } catch (error: unknown) {
    return { success: false, stderr: (error as { stderr?: string }).stderr || String(error) };
  }
}

function runStep(label: string, cmd: string | null, projectDir: string): string | null {
  if (!cmd) return null;
  const result = runCommand(cmd, projectDir);
  return result.success ? null : `${label} failed:\n${result.stderr}`;
}

export function runQaChecks(qaFiles: string[], projectDir: string): string[] {
  const typecheckCmd = buildTypecheckCommand(getTypecheckFiles(qaFiles));
  const testCmd = buildTestCommand(discoverTestFiles(qaFiles, projectDir));
  const errors: string[] = [];
  const typecheckErr = runStep("Typecheck", typecheckCmd, projectDir);
  if (typecheckErr) errors.push(typecheckErr);
  const testErr = runStep("Tests", testCmd, projectDir);
  if (testErr) errors.push(testErr);
  return errors;
}

export type StopHookResult = { systemMessage: string };

export function formatStopHookOutput(result: StopHookResult): string {
  return JSON.stringify(result);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeInput(input: unknown): StopHookInput {
  return isRecord(input) ? (input as StopHookInput) : {};
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function capUtf8Bytes(value: string, maxBytes: number): { value: string; truncated: boolean } {
  if (byteLength(value) <= maxBytes) return { value, truncated: false };
  let bytes = 0;
  let output = "";
  for (const char of value) {
    const charBytes = byteLength(char);
    if (bytes + charBytes > maxBytes) break;
    output += char;
    bytes += charBytes;
  }
  return { value: output, truncated: true };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function projectDirFor(input: StopHookInput, cwd: string, env: EnvLike): string {
  if (env.CLAUDE_PROJECT_DIR && env.CLAUDE_PROJECT_DIR.length > 0) return env.CLAUDE_PROJECT_DIR;
  if (typeof input.cwd === "string" && input.cwd.length > 0) return input.cwd;
  return cwd;
}

export function resolveSessionMemoryDbPath(projectDir: string, env: EnvLike = process.env): string {
  if (env.WP_SESSION_MEMORY_DB && env.WP_SESSION_MEMORY_DB.length > 0)
    return env.WP_SESSION_MEMORY_DB;
  if (env.WP_SESSION_MEMORY_DIR && env.WP_SESSION_MEMORY_DIR.length > 0) {
    return join(env.WP_SESSION_MEMORY_DIR, "sessions.sqlite");
  }
  try {
    return getSurfacePath("session-memory/sessions.sqlite", "worktree", projectDir);
  } catch (error) {
    if (!(error instanceof NotInGitRepoError)) throw error;
    return join(
      tmpdir(),
      "webpresso-session-memory",
      repoHashFromRoot(projectDir),
      "sessions.sqlite",
    );
  }
}

export function buildStopTurnSummary(
  changedFiles: string[],
  env: EnvLike = process.env,
  assistantMessage?: string,
): {
  content: string;
  summary: string;
  changedFiles: string[];
  omittedFileCount: number;
  truncated: boolean;
} {
  const maxFiles = parsePositiveInt(env.WP_STOP_MAX_CHANGED_FILES, DEFAULT_MAX_CHANGED_FILES);
  const maxSummaryBytes = parsePositiveInt(
    env.WP_STOP_MAX_SUMMARY_BYTES,
    DEFAULT_MAX_SUMMARY_BYTES,
  );
  const boundedFiles = changedFiles.slice(0, maxFiles);
  const omittedFileCount = Math.max(0, changedFiles.length - boundedFiles.length);
  const assistantSummary =
    assistantMessage && assistantMessage.trim().length > 0
      ? capUtf8Bytes(assistantMessage.trim().replace(/\s+/gu, " "), 512)
      : null;
  const changedSummary =
    boundedFiles.length === 0
      ? "no provided changed files"
      : `Changed files (${changedFiles.length}): ${boundedFiles.join(", ")}${omittedFileCount > 0 ? ` (+${omittedFileCount} omitted)` : ""}`;
  const summary = assistantSummary
    ? `${changedSummary}; assistant: ${assistantSummary.value}`
    : changedSummary;
  const content = JSON.stringify({
    changedFiles: boundedFiles,
    changedFileCount: changedFiles.length,
    omittedFileCount,
    ...(assistantSummary ? { assistantSummary: assistantSummary.value } : {}),
  });
  const cappedContent = capUtf8Bytes(content, maxSummaryBytes);
  return {
    content: cappedContent.value,
    summary: capUtf8Bytes(summary, 160).value,
    changedFiles: boundedFiles,
    omittedFileCount,
    truncated: cappedContent.truncated || Boolean(assistantSummary?.truncated),
  };
}

function extractChangedFilesFromInput(input: StopHookInput): string[] {
  const value = Array.isArray(input.changed_files) ? input.changed_files : input.changedFiles;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function extractAssistantMessage(input: StopHookInput): string | undefined {
  for (const value of [
    input.last_assistant_message,
    input.assistant_message,
    input.response,
    input.message,
  ]) {
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

export function captureStopTurnSummary(
  inputValue: unknown,
  cwd: string,
  env: EnvLike = process.env,
  deps: StopCaptureDeps = {},
): boolean {
  const input = normalizeInput(inputValue);
  const projectDir = projectDirFor(input, cwd, env);
  const changed = deps.getChangedFiles
    ? safeGetChangedFiles(projectDir, deps.getChangedFiles)
    : { files: extractChangedFilesFromInput(input), degraded: false };
  const assistantMessage = extractAssistantMessage(input);
  if (changed.degraded || (changed.files.length === 0 && !assistantMessage)) return false;

  try {
    const dbPath = deps.dbPath ?? resolveSessionMemoryDbPath(projectDir, env);
    mkdirSync(dirname(dbPath), { recursive: true });
    const store = deps.createStore?.(dbPath) ?? new SessionMemorySessionStore(dbPath);
    try {
      const repoHash = deps.repoHash?.(projectDir) ?? repoHashFromRoot(projectDir);
      const turnSummary = buildStopTurnSummary(changed.files, env, assistantMessage);
      const event = buildContinuityEvent({
        eventType: "assistant_turn_summary",
        toolName: "Stop",
        content: turnSummary.content,
        summary: turnSummary.summary,
        priority: 70,
        metadata: {
          source: "stop-hook",
          hookEventName: input.hook_event_name ?? "Stop",
          transcriptPath: input.transcript_path ?? undefined,
          turnId: input.turn_id ?? undefined,
          changedFileCount: changed.files.length,
          omittedFileCount: turnSummary.omittedFileCount,
          ...(turnSummary.truncated ? { truncated: true } : {}),
        },
        maxContentBytes: DEFAULT_MAX_SUMMARY_BYTES,
      });
      store.captureEvent({
        repoHash,
        agentId: input.agent_id ?? input.agent_type ?? "Stop",
        ...(input.session_id === undefined ? {} : { sessionId: input.session_id }),
        event: { ...event, ts: (deps.now?.() ?? new Date()).toISOString() },
      });
      return true;
    } finally {
      store.close();
    }
  } catch {
    return false;
  }
}

export function processStopHookInput(
  inputValue: unknown,
  cwd: string,
  env: EnvLike = process.env,
  deps: StopCaptureDeps = {},
): StopHookOutput {
  captureStopTurnSummary(inputValue, cwd, env, deps);
  return {};
}

export const buildStopHookOutput = processStopHookInput;

export function formatStopHookJsonOutput(output: StopHookOutput): string {
  return JSON.stringify(output);
}

export async function main(): Promise<void> {
  await runHook(
    // `Stop` is latency-sensitive and user-visible. Until webpresso grows a
    // deferred execution plane, broad typecheck/test sweeps stay off the hot
    // path instead of shelling synchronously at turn end.
    (input) => processStopHookInput(input, process.cwd(), process.env),
    formatStopHookJsonOutput,
  );
}

if (isDirectEntrypoint(import.meta.url)) {
  void main();
}
