/**
 * Auto-update orchestrator.
 *
 * `runUpdateFlow(version)` is the single entry point called from bootstrap.ts.
 * It checks the registry for a newer version and, when one is available:
 *   1. Prints the boxen banner via update-notifier.
 *   2. Optionally schedules a deferred background install (unless opt-out).
 *
 * The function NEVER throws — all errors are sunk to logUpdateError per D13.
 *
 * ## configPath note
 * update-notifier v7.3.1 does NOT expose a `configPath` (or equivalent) option
 * in its public constructor API. The configstore path is derived internally as
 * `update-notifier-<pkgName>` inside the XDG config dir. Passing a custom path
 * is not possible without monkey-patching the library. The plan's "pass
 * configPath overriding to point at getSurfacePath('update-notifier-cache.json',
 * 'user')" is therefore not implementable through the public API.
 *
 * The tombstone and concurrency-lockout machinery in installer.ts still reads
 * and writes `getSurfacePath('update-notifier-cache.json', 'user')` so those
 * paths remain consistent within the agent-kit state root. The notifier's own
 * cache (for the registry poll interval) lives in the standard XDG config dir
 * as managed by the library.
 */
/**
 * Orchestrate the full auto-update pipeline for the given package version.
 * Resolves without throwing — any error is written to auto-update.log.
 */
export declare function runUpdateFlow(version: string): Promise<void>;
//# sourceMappingURL=run.d.ts.map