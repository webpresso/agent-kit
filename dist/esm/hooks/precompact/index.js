#!/usr/bin/env bun
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { isDirectEntrypoint } from '#hooks/shared/direct-entrypoint';
import { runHook } from '#hooks/shared/hook-bootstrap';
import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js';
import { buildContinuityEvent } from '#session-memory/hook-capture.js';
import { repoHashFromRoot } from '#session-memory/repo-hash.js';
import { SessionMemorySessionStore } from '#session-memory/session.js';
export const DEFAULT_MAX_SNAPSHOT_BYTES = 32 * 1024;
export const DEFAULT_MAX_EVENT_BYTES = 2 * 1024;
export const DEFAULT_CAP_MS = 150;
export const DEFAULT_MIN_PRIORITY = 50;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function normalizeInput(input) {
    return isRecord(input) ? input : {};
}
function safeJsonStringify(value) {
    const seen = new WeakSet();
    return JSON.stringify(value, (_key, nested) => {
        if (typeof nested === 'bigint')
            return nested.toString();
        if (typeof nested === 'object' && nested !== null) {
            if (seen.has(nested))
                return '[Circular]';
            seen.add(nested);
        }
        return nested;
    });
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
export function resolveSessionMemoryDbPath(projectDir, env) {
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
export function formatPreCompactOutput(output) {
    return safeJsonStringify(output);
}
export function buildOutput(inputValue, cwd, env, deps = {}) {
    try {
        const input = normalizeInput(inputValue);
        const projectDir = projectDirFor(input, cwd, env);
        const repoHash = deps.repoHash?.(projectDir) ?? repoHashFromRoot(projectDir);
        const dbPath = deps.dbPath ?? resolveSessionMemoryDbPath(projectDir, env);
        mkdirSync(dirname(dbPath), { recursive: true });
        const store = deps.createStore?.(dbPath) ?? new SessionMemorySessionStore(dbPath);
        try {
            const agentId = input.agent_id ?? input.agent_type ?? 'default';
            const sessionId = input.session_id;
            const timestamp = (deps.now?.() ?? new Date()).toISOString();
            const boundary = buildContinuityEvent({
                eventType: 'compaction_boundary',
                toolName: 'PreCompact',
                content: 'PreCompact snapshot requested before host context compaction.',
                summary: 'Pre-compaction snapshot boundary',
                priority: 100,
                metadata: {
                    source: 'precompact-hook',
                    trigger: input.trigger ?? 'unknown',
                    hookEventName: input.hook_event_name ?? 'PreCompact',
                    transcriptPath: input.transcript_path ?? undefined,
                    turnId: input.turn_id ?? undefined,
                    model: input.model ?? undefined,
                },
                maxContentBytes: DEFAULT_MAX_EVENT_BYTES,
            });
            store.captureEvent({
                repoHash,
                agentId,
                ...(sessionId === undefined ? {} : { sessionId }),
                event: { ...boundary, ts: timestamp },
            });
            store.snapshot({
                repoHash,
                agentId,
                ...(sessionId === undefined ? {} : { sessionId }),
                capMs: parsePositiveInt(env.WP_PRECOMPACT_CAP_MS, DEFAULT_CAP_MS),
                minPriority: parsePositiveInt(env.WP_PRECOMPACT_MIN_PRIORITY, DEFAULT_MIN_PRIORITY),
                maxEventBytes: parsePositiveInt(env.WP_PRECOMPACT_MAX_EVENT_BYTES, DEFAULT_MAX_EVENT_BYTES),
                maxSnapshotBytes: parsePositiveInt(env.WP_PRECOMPACT_MAX_SNAPSHOT_BYTES, DEFAULT_MAX_SNAPSHOT_BYTES),
            });
            return {};
        }
        finally {
            store.close();
        }
    }
    catch {
        // Hooks must fail open: compaction should continue even when continuity storage is unavailable.
        return {};
    }
}
export async function main() {
    await runHook((input) => buildOutput(input, process.cwd(), process.env), (output) => formatPreCompactOutput(output));
}
if (isDirectEntrypoint(import.meta.url)) {
    void main();
}
//# sourceMappingURL=index.js.map