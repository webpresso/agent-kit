export interface UpdateNotifierCacheData {
    readonly latest?: unknown;
    readonly current?: unknown;
    readonly lastUpdateCheck?: unknown;
}
export declare const UPDATE_CACHE_FILENAME = "update-notifier-cache.json";
export declare const UPDATE_CHECK_INTERVAL_MS: number;
export declare function readUpdateNotifierCache(cachePath: string): UpdateNotifierCacheData | null;
export declare function parseUpdateCacheTimestamp(value: unknown): number | null;
export declare function readFreshCachedLatestRelease(cachePath: string, now?: number, maxAgeMs?: number): string | null;
//# sourceMappingURL=cache.d.ts.map