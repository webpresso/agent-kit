import { readFileSync } from "node:fs";
export const UPDATE_CACHE_FILENAME = "update-notifier-cache.json";
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export function readUpdateNotifierCache(cachePath) {
    try {
        const parsed = JSON.parse(readFileSync(cachePath, "utf8"));
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
export function parseUpdateCacheTimestamp(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string") {
        const ts = Date.parse(value);
        return Number.isNaN(ts) ? null : ts;
    }
    return null;
}
export function readFreshCachedLatestRelease(cachePath, now = Date.now(), maxAgeMs = UPDATE_CHECK_INTERVAL_MS) {
    const parsed = readUpdateNotifierCache(cachePath);
    if (parsed === null || typeof parsed.latest !== "string")
        return null;
    const ts = parseUpdateCacheTimestamp(parsed.lastUpdateCheck);
    if (ts === null || now - ts >= maxAgeMs)
        return null;
    return parsed.latest;
}
//# sourceMappingURL=cache.js.map