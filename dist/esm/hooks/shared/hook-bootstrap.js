import { closeSync, openSync } from 'node:fs';
/**
 * Suppress stderr at the file-descriptor level.
 * This handles native C++ module stderr (e.g. better-sqlite3) that bypasses
 * Node.js process.stderr. Must be called before any imports that trigger
 * native module loading.
 *
 * Cross-platform: no-ops on Windows (fd redirect not portable there).
 */
export function suppressStderr() {
    if (process.platform === 'win32')
        return;
    try {
        closeSync(2);
        openSync('/dev/null', 'w');
    }
    catch {
        // If stderr is already closed or /dev/null unavailable, ignore silently
    }
}
/**
 * Read all stdin bytes and return as UTF-8 string.
 */
export async function readStdinJson() {
    const chunks = [];
    for await (const chunk of process.stdin)
        chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf-8');
}
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
export async function runHook(handler, formatter) {
    suppressStderr();
    const raw = await readStdinJson();
    if (!raw.trim()) {
        process.stdout.write('{}');
        process.exit(0);
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        process.stdout.write('{}');
        process.exit(0);
    }
    const result = handler(parsed);
    process.stdout.write(result !== null ? formatter(result) : '{}');
    process.exit(0);
}
//# sourceMappingURL=hook-bootstrap.js.map