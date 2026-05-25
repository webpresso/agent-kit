/**
 * BlueprintSyncClient — webpresso HTTP client for the webpresso platform API.
 *
 * Implements `BlueprintPlatformClient` (types.ts) using the Fetch API.
 *
 * Design:
 *  - WP_BLUEPRINT_PLATFORM_DISABLED=1: every method is a no-op / empty result.
 *  - Token from SyncCredentials (loaded via loadSyncCredentials() in auth.ts).
 *  - Idempotency: auto-generates a UUID eventId when payload.eventId is empty.
 *  - Retry: max 3 attempts on 5xx / network errors, exponential backoff.
 *  - 401: throws AuthError immediately — no retry (token invalid, re-auth needed).
 *  - 409: treated as success (idempotent duplicate, platform silently ignores).
 *  - 429: retried with backoff, counts toward the 3-attempt limit.
 *  - listTemplates: reads from WP_BLUEPRINT_TEMPLATES_URL; returns [] on error.
 *  - Structured log on every pushEvent call.
 */
import { randomUUID } from 'node:crypto';
// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------
export class AuthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthError';
    }
}
export class SyncDisabledError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SyncDisabledError';
    }
}
const DEFAULT_RETRY = {
    baseDelayMs: 200,
    maxAttempts: 3,
};
const DEFAULT_TEMPLATES_URL = 'https://raw.githubusercontent.com/webpresso/webpresso/main/catalog/blueprint-templates/index.json';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function isDisabled() {
    return process.env['WP_BLUEPRINT_PLATFORM_DISABLED'] === '1';
}
function resolveEventId(id) {
    return id.length > 0 ? id : randomUUID();
}
function isRetryableStatus(status) {
    return status === 429 || (status >= 500 && status <= 599);
}
function emptySnapshot() {
    return { blueprints: [], fetchedAt: new Date().toISOString() };
}
// ---------------------------------------------------------------------------
// BlueprintSyncClient
// ---------------------------------------------------------------------------
export class BlueprintSyncClient {
    creds;
    fetchFn;
    retryOpts;
    constructor(creds, fetchFn = globalThis.fetch, retryOptions = {}) {
        this.creds = creds;
        this.fetchFn = fetchFn;
        this.retryOpts = { ...DEFAULT_RETRY, ...retryOptions };
    }
    // -------------------------------------------------------------------------
    // pushEvent
    // -------------------------------------------------------------------------
    async pushEvent(payload) {
        if (isDisabled())
            return;
        const eventId = resolveEventId(payload.eventId);
        const body = { ...payload, eventId };
        const url = `${this.creds.platformUrl}/v1/blueprint-events`;
        await this.retryFetch(url, {
            method: 'POST',
            headers: this.authHeaders(),
            body: JSON.stringify(body),
        }, (status, durationMs) => {
            console.log(JSON.stringify({
                level: 'info',
                eventType: payload.type,
                eventId,
                httpStatus: status,
                durationMs,
            }));
        });
    }
    // -------------------------------------------------------------------------
    // getSnapshot
    // -------------------------------------------------------------------------
    async getSnapshot(opts) {
        if (isDisabled())
            return emptySnapshot();
        const path = opts?.slug != null && opts.slug.length > 0
            ? `/v1/blueprints/${encodeURIComponent(opts.slug)}`
            : '/v1/blueprints';
        const url = `${this.creds.platformUrl}${path}`;
        const response = await this.fetchOnce(url, {
            method: 'GET',
            headers: this.authHeaders(),
        });
        const json = (await response.json());
        return json;
    }
    // -------------------------------------------------------------------------
    // listTemplates
    // -------------------------------------------------------------------------
    async listTemplates() {
        if (isDisabled())
            return [];
        const url = process.env['WP_BLUEPRINT_TEMPLATES_URL'] ?? DEFAULT_TEMPLATES_URL;
        try {
            const response = await this.fetchFn(url, { method: 'GET' });
            if (!response.ok)
                return [];
            const json = (await response.json());
            return json;
        }
        catch {
            return [];
        }
    }
    // -------------------------------------------------------------------------
    // healthCheck
    // -------------------------------------------------------------------------
    async healthCheck() {
        if (isDisabled())
            return { ok: false, latencyMs: 0 };
        const url = `${this.creds.platformUrl}/health`;
        const start = Date.now();
        try {
            const response = await this.fetchFn(url, {
                method: 'GET',
                headers: this.authHeaders(),
            });
            const latencyMs = Date.now() - start;
            return { ok: response.ok, latencyMs };
        }
        catch {
            return { ok: false, latencyMs: 0 };
        }
    }
    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------
    authHeaders() {
        return {
            Authorization: `Bearer ${this.creds.token}`,
            'Content-Type': 'application/json',
        };
    }
    /**
     * Perform a single fetch without retry logic.
     * Throws on non-ok responses (except 409 which is treated as success).
     */
    async fetchOnce(url, init) {
        const response = await this.fetchFn(url, init);
        if (response.status === 401) {
            throw new AuthError(`401 Unauthorized — re-authentication required for ${url}`);
        }
        if (!response.ok && response.status !== 409) {
            throw new Error(`HTTP ${response.status} from ${url}`);
        }
        return response;
    }
    /**
     * Perform a fetch with retry logic (max 3 attempts, exponential backoff).
     *
     * - 401: throw AuthError immediately (no retry).
     * - 409: return immediately (idempotent success).
     * - 429 / 5xx: retry with exponential backoff.
     * - Network errors: retry with exponential backoff, then throw with offline context.
     *
     * The `onAttempt` callback fires after EACH attempt (including the final one)
     * with the HTTP status and duration. On network error, status = 0.
     */
    async retryFetch(url, init, onAttempt) {
        const { maxAttempts, baseDelayMs } = this.retryOpts;
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const start = Date.now();
            try {
                const response = await this.fetchFn(url, init);
                const durationMs = Date.now() - start;
                onAttempt?.(response.status, durationMs);
                if (response.status === 401) {
                    throw new AuthError(`401 Unauthorized — re-authentication required for ${url}`);
                }
                if (response.status === 409) {
                    return response; // idempotent — treat as success
                }
                if (isRetryableStatus(response.status)) {
                    lastError = new Error(`HTTP ${response.status} from ${url}`);
                    if (attempt < maxAttempts) {
                        await sleep(baseDelayMs * 2 ** (attempt - 1));
                        continue;
                    }
                    throw lastError;
                }
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} from ${url}`);
                }
                return response;
            }
            catch (error) {
                if (error instanceof AuthError)
                    throw error;
                const durationMs = Date.now() - start;
                onAttempt?.(0, durationMs);
                lastError = error;
                if (attempt < maxAttempts) {
                    await sleep(baseDelayMs * 2 ** (attempt - 1));
                    continue;
                }
                // Final attempt failed — wrap with offline context if it looks like a
                // network error (not an HTTP error we re-threw above).
                const msg = error instanceof Error ? error.message : String(error);
                const isNetworkError = !msg.startsWith('HTTP ');
                if (isNetworkError) {
                    throw new Error(`Network error (offline?): ${msg}. Check connectivity and retry.`);
                }
                throw error;
            }
        }
        // Unreachable, but satisfies TypeScript's exhaustive analysis.
        throw lastError;
    }
}
//# sourceMappingURL=client.js.map