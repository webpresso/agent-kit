/**
 * Credential loading for the BlueprintSyncClient.
 *
 * Reads configuration from environment variables; never writes to disk.
 *
 * Environment variables:
 *   AK_BLUEPRINT_PLATFORM_DISABLED  — set to "1" to bypass all platform ops
 *   AK_BLUEPRINT_PLATFORM_TOKEN     — required Bearer token
 *   AK_BLUEPRINT_PLATFORM_URL       — override API base URL (default: https://api.webpresso.io)
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
 *  - `AK_BLUEPRINT_PLATFORM_DISABLED=1` (emergency escape hatch), or
 *  - `AK_BLUEPRINT_PLATFORM_TOKEN` is not set or is an empty string.
 *
 * The caller must treat `null` as "sync is unavailable" and bypass all
 * platform operations.
 */
export declare function loadSyncCredentials(): SyncCredentials | null;
//# sourceMappingURL=auth.d.ts.map