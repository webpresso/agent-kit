/**
 * Credential loading for the BlueprintSyncClient.
 *
 * Reads configuration from environment variables; never writes to disk.
 *
 * Environment variables:
 *   WP_BLUEPRINT_PLATFORM_DISABLED  — set to "1" to bypass all platform ops
 *   WP_BLUEPRINT_PLATFORM_TOKEN     — required Bearer token
 *   WP_BLUEPRINT_PLATFORM_URL       — override API base URL (default: https://api.webpresso.io)
 */
export interface SyncCredentials {
    readonly token: string;
    readonly platformUrl: string;
    readonly repoId: string;
}
/**
 * Load sync credentials from the environment.
 *
 * Returns `null` when:
 *  - `WP_BLUEPRINT_PLATFORM_DISABLED=1` (emergency escape hatch), or
 *  - `WP_BLUEPRINT_PLATFORM_TOKEN` is not set or is an empty string.
 *
 * The caller must treat `null` as "sync is unavailable" and bypass all
 * platform operations.
 */
export declare function loadSyncCredentials(): SyncCredentials | null;
//# sourceMappingURL=auth.d.ts.map