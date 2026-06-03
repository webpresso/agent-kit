/**
 * Suppress stderr at the file-descriptor level.
 * This handles native C++ module stderr (e.g. better-sqlite3) that bypasses
 * Node.js process.stderr. Must be called before any imports that trigger
 * native module loading.
 *
 * Cross-platform: no-ops on Windows (fd redirect not portable there).
 */
export declare function suppressStderr(): void;
/**
 * Read all stdin bytes and return as UTF-8 string.
 */
export declare function readStdinJson(): Promise<string>;
/**
 * Shared hook entry-point bootstrap.
 *
 * Handles:
 * 1. Stderr suppression (keeps Claude Code UI clean)
 * 2. Stdin reading + JSON parsing
 * 3. Handler invocation
 * 4. JSON output writing
 * 5. Clean process exit
 *
 * When `handler` returns `null`, writes `{}` (passthrough — Claude proceeds normally).
 * When `handler` returns a value, `formatter` converts it to a JSON string for stdout.
 */
export declare function runHook<T>(handler: (input: unknown) => T | null, formatter: (result: T) => string): Promise<void>;
//# sourceMappingURL=hook-bootstrap.d.ts.map