#!/usr/bin/env bun
import { globSync } from 'glob';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { runHook } from '#hooks/shared/hook-bootstrap';
import { isLintableFile, isSkippedPath } from '#hooks/post-tool/lint-after-edit';
import { isDirectEntrypoint } from '#hooks/shared/direct-entrypoint';
import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js';
import { buildContinuityEvent } from '#session-memory/hook-capture.js';
import { repoHashFromRoot } from '#session-memory/repo-hash.js';
import { SessionMemorySessionStore } from '#session-memory/session.js';
const TYPECHECKABLE_EXTENSIONS = new Set(['.ts', '.tsx']);
const DEFAULT_MAX_CHANGED_FILES = 20;
const DEFAULT_MAX_SUMMARY_BYTES = 2048;
export function getChangedFiles(projectDir) {
    const unstaged = execSync('git diff --name-only', { cwd: projectDir, encoding: 'utf-8' }).trim();
    const staged = execSync('git diff --cached --name-only', {
        cwd: projectDir,
        encoding: 'utf-8',
    }).trim();
    const all = new Set();
    for (const line of unstaged.split('\n'))
        if (line)
            all.add(line);
    for (const line of staged.split('\n'))
        if (line)
            all.add(line);
    return [...all];
}
function safeGetChangedFiles(projectDir, getFiles) {
    try {
        return { files: getFiles(projectDir), degraded: false };
    }
    catch {
        return { files: [], degraded: true };
    }
}
export function filterQaFiles(files) {
    return files.filter((f) => isLintableFile(f) && !isSkippedPath(f));
}
export function getTypecheckFiles(files) {
    return files.filter((f) => TYPECHECKABLE_EXTENSIONS.has(extname(f)));
}
export function findTestFiles(sourceFile, projectDir) {
    const ext = extname(sourceFile);
    const base = basename(sourceFile, ext);
    const dir = dirname(sourceFile);
    if (base.endsWith('.test') || base.endsWith('.integration.test'))
        return [sourceFile];
    const pattern = join(dir, `${base}.{test,integration.test}{.ts,.tsx}`);
    return globSync(pattern, { cwd: projectDir });
}
export function discoverTestFiles(changedFiles, projectDir) {
    const testFiles = new Set();
    for (const file of changedFiles) {
        for (const testFile of findTestFiles(file, projectDir))
            testFiles.add(testFile);
    }
    return [...testFiles];
}
export function buildTypecheckCommand(files) {
    if (files.length === 0)
        return null;
    return `just typecheck ${files.map((f) => `--file '${f}'`).join(' ')}`;
}
export function buildTestCommand(files) {
    if (files.length === 0)
        return null;
    return `just test ${files.map((f) => `--file '${f}'`).join(' ')}`;
}
function runCommand(cmd, projectDir) {
    try {
        execSync(cmd, { cwd: projectDir, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' });
        return { success: true, stderr: '' };
    }
    catch (error) {
        return { success: false, stderr: error.stderr || String(error) };
    }
}
function runStep(label, cmd, projectDir) {
    if (!cmd)
        return null;
    const result = runCommand(cmd, projectDir);
    return result.success ? null : `${label} failed:\n${result.stderr}`;
}
export function runQaChecks(qaFiles, projectDir) {
    const typecheckCmd = buildTypecheckCommand(getTypecheckFiles(qaFiles));
    const testCmd = buildTestCommand(discoverTestFiles(qaFiles, projectDir));
    const errors = [];
    const typecheckErr = runStep('Typecheck', typecheckCmd, projectDir);
    if (typecheckErr)
        errors.push(typecheckErr);
    const testErr = runStep('Tests', testCmd, projectDir);
    if (testErr)
        errors.push(testErr);
    return errors;
}
export function formatStopHookOutput(result) {
    return JSON.stringify(result);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function normalizeInput(input) {
    return isRecord(input) ? input : {};
}
function byteLength(value) {
    return Buffer.byteLength(value, 'utf8');
}
function capUtf8Bytes(value, maxBytes) {
    if (byteLength(value) <= maxBytes)
        return { value, truncated: false };
    let bytes = 0;
    let output = '';
    for (const char of value) {
        const charBytes = byteLength(char);
        if (bytes + charBytes > maxBytes)
            break;
        output += char;
        bytes += charBytes;
    }
    return { value: output, truncated: true };
}
function parsePositiveInt(value, fallback) {
    if (value === undefined)
        return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
function projectDirFor(input, cwd, env) {
    if (env.CLAUDE_PROJECT_DIR && env.CLAUDE_PROJECT_DIR.length > 0)
        return env.CLAUDE_PROJECT_DIR;
    if (typeof input.cwd === 'string' && input.cwd.length > 0)
        return input.cwd;
    return cwd;
}
export function resolveSessionMemoryDbPath(projectDir, env = process.env) {
    if (env.WP_SESSION_MEMORY_DB && env.WP_SESSION_MEMORY_DB.length > 0)
        return env.WP_SESSION_MEMORY_DB;
    if (env.WP_SESSION_MEMORY_DIR && env.WP_SESSION_MEMORY_DIR.length > 0) {
        return join(env.WP_SESSION_MEMORY_DIR, 'sessions.sqlite');
    }
    try {
        return getSurfacePath('session-memory/sessions.sqlite', 'worktree', projectDir);
    }
    catch (error) {
        if (!(error instanceof NotInGitRepoError))
            throw error;
        return join(tmpdir(), 'webpresso-session-memory', repoHashFromRoot(projectDir), 'sessions.sqlite');
    }
}
export function buildStopTurnSummary(changedFiles, env = process.env, assistantMessage) {
    const maxFiles = parsePositiveInt(env.WP_STOP_MAX_CHANGED_FILES, DEFAULT_MAX_CHANGED_FILES);
    const maxSummaryBytes = parsePositiveInt(env.WP_STOP_MAX_SUMMARY_BYTES, DEFAULT_MAX_SUMMARY_BYTES);
    const boundedFiles = changedFiles.slice(0, maxFiles);
    const omittedFileCount = Math.max(0, changedFiles.length - boundedFiles.length);
    const assistantSummary = assistantMessage && assistantMessage.trim().length > 0
        ? capUtf8Bytes(assistantMessage.trim().replace(/\s+/gu, ' '), 512)
        : null;
    const changedSummary = boundedFiles.length === 0
        ? 'no provided changed files'
        : `Changed files (${changedFiles.length}): ${boundedFiles.join(', ')}${omittedFileCount > 0 ? ` (+${omittedFileCount} omitted)` : ''}`;
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
function extractChangedFilesFromInput(input) {
    const value = Array.isArray(input.changed_files) ? input.changed_files : input.changedFiles;
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === 'string' && item.length > 0);
}
function extractAssistantMessage(input) {
    for (const value of [
        input.last_assistant_message,
        input.assistant_message,
        input.response,
        input.message,
    ]) {
        if (typeof value === 'string' && value.trim().length > 0)
            return value;
    }
    return undefined;
}
export function captureStopTurnSummary(inputValue, cwd, env = process.env, deps = {}) {
    const input = normalizeInput(inputValue);
    const projectDir = projectDirFor(input, cwd, env);
    const changed = deps.getChangedFiles
        ? safeGetChangedFiles(projectDir, deps.getChangedFiles)
        : { files: extractChangedFilesFromInput(input), degraded: false };
    const assistantMessage = extractAssistantMessage(input);
    if (changed.degraded || (changed.files.length === 0 && !assistantMessage))
        return false;
    try {
        const dbPath = deps.dbPath ?? resolveSessionMemoryDbPath(projectDir, env);
        mkdirSync(dirname(dbPath), { recursive: true });
        const store = deps.createStore?.(dbPath) ?? new SessionMemorySessionStore(dbPath);
        try {
            const repoHash = deps.repoHash?.(projectDir) ?? repoHashFromRoot(projectDir);
            const turnSummary = buildStopTurnSummary(changed.files, env, assistantMessage);
            const event = buildContinuityEvent({
                eventType: 'assistant_turn_summary',
                toolName: 'Stop',
                content: turnSummary.content,
                summary: turnSummary.summary,
                priority: 70,
                metadata: {
                    source: 'stop-hook',
                    hookEventName: input.hook_event_name ?? 'Stop',
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
                agentId: input.agent_id ?? input.agent_type ?? 'Stop',
                ...(input.session_id === undefined ? {} : { sessionId: input.session_id }),
                event: { ...event, ts: (deps.now?.() ?? new Date()).toISOString() },
            });
            return true;
        }
        finally {
            store.close();
        }
    }
    catch {
        return false;
    }
}
export function processStopHookInput(inputValue, cwd, env = process.env, deps = {}) {
    captureStopTurnSummary(inputValue, cwd, env, deps);
    return {};
}
export const buildStopHookOutput = processStopHookInput;
export function formatStopHookJsonOutput(output) {
    return JSON.stringify(output);
}
export async function main() {
    await runHook(
    // `Stop` is latency-sensitive and user-visible. Until webpresso grows a
    // deferred execution plane, broad typecheck/test sweeps stay off the hot
    // path instead of shelling synchronously at turn end.
    (input) => processStopHookInput(input, process.cwd(), process.env), formatStopHookJsonOutput);
}
if (isDirectEntrypoint(import.meta.url)) {
    void main();
}
//# sourceMappingURL=qa-changed-files.js.map