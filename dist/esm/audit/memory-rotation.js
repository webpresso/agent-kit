/**
 * `ak audit memory-rotation` — surfaces recent rotation events from
 * `.agent/.rotation-log.jsonl`.
 *
 * Each line in the log is a JSON object describing a section that was
 * rotated out of agent memory. This audit surfaces events from the last
 * N days (default 30) and checks for unacknowledged rotations.
 *
 * With `--strict`, fails if any rotation lacks `last_rotation_acked`
 * within 30 days.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js';
const DEFAULT_WINDOW_DAYS = 30;
function parseRotationLog(logPath) {
    if (!existsSync(logPath))
        return [];
    let raw;
    try {
        raw = readFileSync(logPath, 'utf8');
    }
    catch {
        return [];
    }
    const entries = [];
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        try {
            const parsed = JSON.parse(trimmed);
            if (!isRotationEntry(parsed))
                continue;
            entries.push(parsed);
        }
        catch {
            // skip malformed lines
        }
    }
    return entries;
}
function isRotationEntry(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const obj = value;
    return (typeof obj['timestamp'] === 'string' &&
        typeof obj['sectionSlug'] === 'string' &&
        typeof obj['sourcePath'] === 'string' &&
        typeof obj['archivedTo'] === 'string' &&
        typeof obj['reason'] === 'string');
}
/**
 * Check if a rotation entry has been acknowledged. We look for a
 * `last_rotation_acked` field in the corresponding memory.merge.yaml.
 * For simplicity, we check if a file at `<sourcePath>.ack` or the
 * `sourcePath` itself contains an `acked:` marker. Consumers can set
 * this via their memory management tooling.
 *
 * Currently: check if the sourcePath file has a `last_rotation_acked:` key.
 */
function isRotationAcked(entry, cwd) {
    const absPath = path.isAbsolute(entry.sourcePath)
        ? entry.sourcePath
        : path.join(cwd, entry.sourcePath);
    if (!existsSync(absPath))
        return false;
    try {
        const content = readFileSync(absPath, 'utf8');
        return content.includes('last_rotation_acked:');
    }
    catch {
        return false;
    }
}
/**
 * Audit memory rotation log.
 */
export function auditMemoryRotation(cwd, options = {}) {
    const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
    const strict = options.strict ?? false;
    const logPath = (() => {
        try {
            return getSurfacePath('audit/rotation-log.jsonl', 'repo', cwd);
        }
        catch (err) {
            if (err instanceof NotInGitRepoError)
                return path.join(cwd, '.agent', '.rotation-log.jsonl');
            throw err;
        }
    })();
    const allEntries = parseRotationLog(logPath);
    const now = Date.now();
    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    const recentEvents = [];
    for (const entry of allEntries) {
        const entryTime = new Date(entry.timestamp).getTime();
        if (Number.isNaN(entryTime))
            continue;
        const ageMs = now - entryTime;
        if (ageMs > windowMs)
            continue;
        const daysAgo = Math.floor(ageMs / (24 * 60 * 60 * 1000));
        const acked = isRotationAcked(entry, cwd);
        recentEvents.push({ ...entry, acked, daysAgo });
    }
    const violations = [];
    if (strict) {
        for (const event of recentEvents) {
            if (!event.acked) {
                violations.push({
                    file: event.sourcePath,
                    message: `Unacknowledged rotation: section '${event.sectionSlug}' rotated ${event.daysAgo}d ago (${event.timestamp}). Set last_rotation_acked in ${event.sourcePath}.`,
                });
            }
        }
    }
    return {
        violations,
        recentEvents,
        checked: recentEvents.length,
        pass: violations.length === 0,
    };
}
/**
 * Adapter to return a RepoAuditResult shape for registry integration.
 */
export function auditMemoryRotationAsRepoResult(cwd, options = {}) {
    const result = auditMemoryRotation(cwd, options);
    return {
        ok: result.pass,
        title: 'Memory rotation audit',
        checked: result.checked,
        violations: result.violations,
    };
}
//# sourceMappingURL=memory-rotation.js.map