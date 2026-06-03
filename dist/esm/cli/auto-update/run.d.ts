/**
 * Auto-update orchestrator.
 *
 * `runUpdateFlow(version)` is the single entry point called from bootstrap.ts.
 * It checks the npm registry for a newer version of @webpresso/agent-kit and,
 * when one is available:
 *   1. Writes a cache entry to the state root (read by the SessionStart banner).
 *   2. Prints a one-line update notice to stderr.
 *   3. Optionally schedules a deferred background install (unless opt-out).
 *
 * The function NEVER throws — all errors are sunk to logUpdateError per D13.
 *
 * ## Registry note
 * Version checks use the public npm registry for the canonical
 * `@webpresso/agent-kit` package.
 */
export declare function fetchLatestRelease(): Promise<string | null>;
/**
 * Orchestrate the full auto-update pipeline for the given package version.
 * Resolves without throwing — any error is written to auto-update.log.
 */
export declare function runUpdateFlow(version: string): Promise<void>;
//# sourceMappingURL=run.d.ts.map