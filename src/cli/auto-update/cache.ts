import { readFileSync } from "node:fs";

export interface UpdateNotifierCacheData {
  readonly latest?: unknown;
  readonly current?: unknown;
  readonly lastUpdateCheck?: unknown;
}

export const UPDATE_CACHE_FILENAME = "update-notifier-cache.json";
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function readUpdateNotifierCache(cachePath: string): UpdateNotifierCacheData | null {
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf8")) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as UpdateNotifierCacheData;
  } catch {
    return null;
  }
}

export function parseUpdateCacheTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : ts;
  }
  return null;
}

export function readFreshCachedLatestRelease(
  cachePath: string,
  now: number = Date.now(),
  maxAgeMs: number = UPDATE_CHECK_INTERVAL_MS,
): string | null {
  const parsed = readUpdateNotifierCache(cachePath);
  if (parsed === null || typeof parsed.latest !== "string") return null;
  const ts = parseUpdateCacheTimestamp(parsed.lastUpdateCheck);
  if (ts === null || now - ts >= maxAgeMs) return null;
  return parsed.latest;
}
