import { getSurfacePath } from "#paths/state-root.js";
import { UPDATE_CACHE_FILENAME, parseUpdateCacheTimestamp, readUpdateNotifierCache, } from "#cli/auto-update/cache.js";
import { isNewerVersion } from "#cli/auto-update/version.js";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export function readUpdateBanner(env) {
    void env;
    let configPath;
    try {
        configPath = getSurfacePath(UPDATE_CACHE_FILENAME, "user");
    }
    catch {
        return null;
    }
    const data = readUpdateNotifierCache(configPath);
    if (data === null)
        return null;
    const { latest, current, lastUpdateCheck } = data;
    if (typeof latest !== "string" || typeof current !== "string")
        return null;
    if (latest === current)
        return null;
    const ts = parseUpdateCacheTimestamp(lastUpdateCheck);
    if (ts !== null && Date.now() - ts > SEVEN_DAYS_MS)
        return null;
    if (!isNewerVersion(latest, current))
        return null;
    return `<wp_update>webpresso ${latest} available (current ${current}). Auto-install runs on the next \`wp\` invocation, or set WP_SKIP_AUTO_INSTALL=1 to opt out.</wp_update>`;
}
//# sourceMappingURL=update-banner.js.map