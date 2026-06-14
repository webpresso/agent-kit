#!/usr/bin/env bun
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { isDirectEntrypoint } from '#hooks/shared/direct-entrypoint';
import { runHook } from '#hooks/shared/hook-bootstrap';
import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js';
import { buildPromptContinuityEvents } from '#session-memory/hook-capture.js';
import { repoHashFromRoot } from '#session-memory/repo-hash.js';
import { SessionMemorySessionStore } from '#session-memory/session.js';
import { setGuardEnabled } from './state.js';
export const DEFAULT_MAX_PROMPT_CAPTURE_BYTES = 2048;
const SECRET_PATTERN = /\b(api[_-]?key|auth(?:orization)?|bearer|password|secret|token)\b\s*[:=]\s*("[^"]+"|'[^']+'|[^\s,;]+)/giu;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function normalizeInput(input) {
    return isRecord(input) ? input : {};
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
function redactPrompt(prompt) {
    let redacted = false;
    const value = prompt.replace(SECRET_PATTERN, (_match, label) => {
        redacted = true;
        return `${label}=[REDACTED]`;
    });
    return { prompt: value, redacted };
}
function capturePromptContinuity(input, projectDir, env, deps) {
    const rawPrompt = typeof input.prompt === 'string' ? input.prompt : '';
    const { prompt, redacted } = redactPrompt(rawPrompt);
    const events = buildPromptContinuityEvents({
        prompt,
        maxContentBytes: DEFAULT_MAX_PROMPT_CAPTURE_BYTES,
    });
    if (events.length === 0)
        return;
    const dbPath = deps.dbPath ?? resolveSessionMemoryDbPath(projectDir, env);
    mkdirSync(dirname(dbPath), { recursive: true });
    const store = deps.createStore?.(dbPath) ?? new SessionMemorySessionStore(dbPath);
    try {
        const repoHash = deps.repoHash?.(projectDir) ?? repoHashFromRoot(projectDir);
        const timestamp = (deps.now?.() ?? new Date()).toISOString();
        for (const event of events) {
            store.captureEvent({
                repoHash,
                agentId: input.agent_id ?? input.agent_type ?? 'UserPromptSubmit',
                ...(input.session_id === undefined ? {} : { sessionId: input.session_id }),
                event: {
                    ...event,
                    ts: timestamp,
                    metadata: {
                        ...event.metadata,
                        source: 'user-prompt-hook',
                        hookEventName: input.hook_event_name ?? 'UserPromptSubmit',
                        transcriptPath: input.transcript_path ?? undefined,
                        turnId: input.turn_id ?? undefined,
                        ...(redacted ? { redacted: true } : {}),
                    },
                },
            });
        }
    }
    finally {
        store.close();
    }
}
export function processGuardSwitchInput(inputValue, cwd, env = process.env, deps = {}) {
    const input = normalizeInput(inputValue);
    const normalized = (input.prompt ?? '').toLowerCase().trim();
    const setEnabled = deps.setGuardEnabled ?? setGuardEnabled;
    if (normalized === 'guard off') {
        setEnabled(false);
        return { exitCode: 2, stderr: '🛡️ Guard disabled — pretool validators will be skipped' };
    }
    if (normalized === 'guard on') {
        setEnabled(true);
        return { exitCode: 2, stderr: '🛡️ Guard enabled — pretool validators active' };
    }
    try {
        capturePromptContinuity(input, projectDirFor(input, cwd, env), env, deps);
    }
    catch {
        // UserPromptSubmit must stay host-safe: storage failures or malformed inputs are no-ops.
    }
    return {};
}
export async function main() {
    await runHook((input) => {
        const result = processGuardSwitchInput(input, process.cwd(), process.env);
        if ('exitCode' in result) {
            console.error(result.stderr);
            process.exit(result.exitCode);
        }
        return null;
    }, () => '{}');
}
if (isDirectEntrypoint(import.meta.url)) {
    void main();
}
//# sourceMappingURL=index.js.map