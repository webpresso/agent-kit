import { TELEMETRY_ENDPOINT, TELEMETRY_TIMEOUT_MS } from './_endpoint.js';
export function isTelemetryEnabled(env) {
    if (env['AK_TELEMETRY'] === '0')
        return false;
    if (env['AK_TELEMETRY'] === '1')
        return true;
    if (env['AK_INTERNAL'] === '1')
        return true;
    return false;
}
export async function reportTthw(payload) {
    if (process.env['AK_TELEMETRY_DEBUG'] === '1') {
        console.error('[ak telemetry]', JSON.stringify(payload));
    }
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TELEMETRY_TIMEOUT_MS);
        try {
            await fetch(TELEMETRY_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
        }
        finally {
            clearTimeout(timer);
        }
    }
    catch {
        // intentionally silent — telemetry must never block or surface errors
    }
}
//# sourceMappingURL=setup-tthw.js.map