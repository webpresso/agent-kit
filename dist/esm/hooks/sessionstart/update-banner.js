import { readFileSync } from 'node:fs';
import { getSurfacePath } from '#paths/state-root.js';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export function readUpdateBanner(env) {
    void env;
    let configPath;
    try {
        configPath = getSurfacePath('update-notifier-cache.json', 'user');
    }
    catch {
        return null;
    }
    let raw;
    try {
        raw = readFileSync(configPath, 'utf-8');
    }
    catch (err) {
        const code = err.code;
        if (code === 'ENOENT')
            return null;
        return null;
    }
    let data;
    try {
        data = JSON.parse(raw);
    }
    catch {
        return null;
    }
    const { latest, current, lastUpdateCheck } = data;
    if (typeof latest !== 'string' || typeof current !== 'string')
        return null;
    if (latest === current)
        return null;
    if (typeof lastUpdateCheck === 'number') {
        const age = Date.now() - lastUpdateCheck;
        if (age > SEVEN_DAYS_MS)
            return null;
    }
    else if (typeof lastUpdateCheck === 'string') {
        const ts = Date.parse(lastUpdateCheck);
        if (!Number.isNaN(ts) && Date.now() - ts > SEVEN_DAYS_MS)
            return null;
    }
    // Basic semver-style comparison: check that latest > current
    if (!isNewerVersion(latest, current))
        return null;
    return `<wp_update>webpresso ${latest} available (current ${current}). Auto-install runs on the next \`wp\` invocation, or set AK_SKIP_AUTO_INSTALL=1 to opt out.</wp_update>`;
}
function isNewerVersion(latest, current) {
    const latestParts = latest.split('.').map((p) => parseInt(p, 10));
    const currentParts = current.split('.').map((p) => parseInt(p, 10));
    const len = Math.max(latestParts.length, currentParts.length);
    for (let i = 0; i < len; i++) {
        const l = latestParts[i] ?? 0;
        const c = currentParts[i] ?? 0;
        if (Number.isNaN(l) || Number.isNaN(c))
            return latest !== current;
        if (l > c)
            return true;
        if (l < c)
            return false;
    }
    return false;
}
//# sourceMappingURL=update-banner.js.map