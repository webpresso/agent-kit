/**
 * Auto-update orchestrator.
 *
 * `runUpdateFlow(version)` is the single entry point called from bootstrap.ts.
 * It checks the npm registry for a newer version of @webpresso/agent-kit and,
 * when one is available:
 *   1. Writes a cache entry to the state root (read by the SessionStart banner).
 *   2. Prints a one-line update notice to stderr.
 *   3. Optionally schedules a deferred background install (unless opt-out).
 *
 * The function NEVER throws — all errors are sunk to logUpdateError per D13.
 *
 * ## Registry note
 * Version checks use the public npm registry for the canonical
 * `@webpresso/agent-kit` package.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { getStateRoot } from '#paths/state-root.js';
import { detect } from './detect-pm.js';
import { scheduleDeferredInstall } from './installer.js';
import { logUpdateError } from './log.js';
import { shouldSkipAutoInstall } from './skip.js';
const PUBLIC_NPM_URL = 'https://registry.npmjs.org/@webpresso%2Fagent-kit';
const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_FILENAME = 'update-notifier-cache.json';
const UpdateCacheSchema = z.object({
    latest: z.string(),
    current: z.string(),
    lastUpdateCheck: z.number(),
});
async function readCache(cachePath) {
    try {
        const raw = await readFile(cachePath, 'utf-8');
        const parsedUnknown = JSON.parse(raw);
        const parsed = parsedUnknown;
        if (typeof parsed.latest === 'string' &&
            typeof parsed.current === 'string' &&
            typeof parsed.lastUpdateCheck === 'number') {
            const result = UpdateCacheSchema.safeParse(parsedUnknown);
            return result.success ? result.data : null;
        }
        return null;
    }
    catch {
        return null;
    }
}
async function writeCache(cachePath, data) {
    try {
        await mkdir(dirname(cachePath), { recursive: true });
        await writeFile(cachePath, JSON.stringify(data, null, 2) + '\n');
    }
    catch {
        // Cache write failure is non-fatal
    }
}
export async function fetchLatestRelease() {
    const res = await fetch(PUBLIC_NPM_URL, {
        // Bound the registry probe — an unbounded fetch blocks every wp invocation
        // for the full TCP connect timeout (~2 min) when the registry is slow.
        signal: AbortSignal.timeout(5000),
        headers: {
            Accept: 'application/json',
        },
    });
    if (!res.ok)
        return null;
    const data = (await res.json());
    return data['dist-tags']?.latest ?? null;
}
function isNewerVersion(latest, current) {
    const l = latest.split('.').map((p) => parseInt(p, 10));
    const c = current.split('.').map((p) => parseInt(p, 10));
    const len = Math.max(l.length, c.length);
    for (let i = 0; i < len; i++) {
        const lv = l[i] ?? 0;
        const cv = c[i] ?? 0;
        if (Number.isNaN(lv) || Number.isNaN(cv))
            return latest !== current;
        if (lv > cv)
            return true;
        if (lv < cv)
            return false;
    }
    return false;
}
/**
 * Orchestrate the full auto-update pipeline for the given package version.
 * Resolves without throwing — any error is written to auto-update.log.
 */
export async function runUpdateFlow(version) {
    try {
        const cachePath = join(getStateRoot(), CACHE_FILENAME);
        const now = Date.now();
        // Check 24-hour interval via cache
        const cached = await readCache(cachePath);
        let latest;
        if (cached !== null && now - cached.lastUpdateCheck < UPDATE_CHECK_INTERVAL) {
            latest = cached.latest;
        }
        else {
            const fetched = await fetchLatestRelease();
            if (fetched === null)
                return;
            latest = fetched;
            await writeCache(cachePath, { latest, current: version, lastUpdateCheck: now });
        }
        if (!isNewerVersion(latest, version))
            return;
        // Notify on stderr — safe for all modes (MCP is gated upstream via shouldSkipUpdateCheck)
        process.stderr.write(`\n  @webpresso/agent-kit ${version} → ${latest} available\n  Auto-install scheduled for next \`wp\` invocation.\n\n`);
        if (shouldSkipAutoInstall(process.env))
            return;
        const plan = detect(process.env, process.argv[1] ?? '');
        if ('abort' in plan) {
            logUpdateError(new Error(plan.abort));
            return;
        }
        scheduleDeferredInstall({ command: plan.command });
    }
    catch (err) {
        logUpdateError(err);
    }
}
//# sourceMappingURL=run.js.map