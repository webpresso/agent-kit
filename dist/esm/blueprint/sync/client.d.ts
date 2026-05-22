/**
 * BlueprintSyncClient — agent-kit HTTP client for the webpresso platform API.
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
import type { SyncCredentials } from './auth.js';
import type { BlueprintPlatformClient, BlueprintPlatformEvent, BlueprintSnapshot, BlueprintTemplateEntry } from './types.js';
export declare class AuthError extends Error {
    constructor(message: string);
}
export declare class SyncDisabledError extends Error {
    constructor(message: string);
}
export interface RetryOptions {
    /** Base delay in ms for exponential backoff (default: 200). */
    readonly baseDelayMs?: number;
    /** Maximum number of attempts (default: 3). */
    readonly maxAttempts?: number;
}
export declare class BlueprintSyncClient implements BlueprintPlatformClient {
    private readonly creds;
    private readonly fetchFn;
    private readonly retryOpts;
    constructor(creds: SyncCredentials, fetchFn?: typeof globalThis.fetch, retryOptions?: RetryOptions);
    pushEvent(payload: BlueprintPlatformEvent): Promise<void>;
    getSnapshot(opts?: {
        readonly slug?: string;
    }): Promise<BlueprintSnapshot>;
    listTemplates(): Promise<readonly BlueprintTemplateEntry[]>;
    healthCheck(): Promise<{
        readonly ok: boolean;
        readonly latencyMs: number;
    }>;
    private authHeaders;
    /**
     * Perform a single fetch without retry logic.
     * Throws on non-ok responses (except 409 which is treated as success).
     */
    private fetchOnce;
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
    private retryFetch;
}
//# sourceMappingURL=client.d.ts.map