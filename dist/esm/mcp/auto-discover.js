/**
 * Tool auto-discovery for the `ak mcp` server.
 *
 * Scans a directory for `*.ts` (source) or `*.js` (built) files, dynamic-imports
 * each, and registers any default-exported {@link ToolDescriptor} on the
 * provided server. Skips test files (`*.test.*`, `*.integration.test.*`) and
 * type-declaration files.
 *
 * Adding a new tool is a one-file affair: drop `src/mcp/tools/<name>.ts` with a
 * default export and the server picks it up at startup. No edits to
 * `server.ts` required.
 */
import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
const SKIP_SUFFIXES = ['.test.ts', '.test.js', '.integration.test.ts', '.integration.test.js'];
const SUPPORTED_EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.cjs']);
function shouldSkip(file) {
    if (file.endsWith('.d.ts') || file.endsWith('.d.ts.map'))
        return true;
    if (file.endsWith('.js.map') || file.endsWith('.ts.map'))
        return true;
    for (const suffix of SKIP_SUFFIXES) {
        if (file.endsWith(suffix))
            return true;
    }
    const ext = extname(file);
    if (!SUPPORTED_EXTENSIONS.has(ext))
        return true;
    return false;
}
function toJsonSchema(schema) {
    // Prefer zod v4's native JSON-Schema export when available (project pins zod
    // ^4.3.6). Fall back to `zod-to-json-schema` for v3-style schemas, then to a
    // permissive `{type: "object"}` for fake/mock duck-typed inputs in tests.
    const ztoj = z
        .toJSONSchema;
    if (typeof ztoj === 'function') {
        try {
            const result = ztoj(schema);
            if (result && typeof result === 'object' && Object.keys(result).length > 1) {
                return result;
            }
        }
        catch {
            /* fall through */
        }
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = zodToJsonSchema(schema);
        if (result && Object.keys(result).length > 1)
            return result;
    }
    catch {
        /* fall through */
    }
    return { type: 'object' };
}
export async function discoverTools(server, toolsDir) {
    const entries = await readdir(toolsDir, { withFileTypes: true });
    const registered = [];
    for (const entry of entries) {
        if (!entry.isFile())
            continue;
        if (shouldSkip(entry.name))
            continue;
        const fullPath = join(toolsDir, entry.name);
        const moduleUrl = pathToFileURL(fullPath).href;
        const mod = (await import(moduleUrl));
        const descriptor = mod.default;
        if (!descriptor || typeof descriptor !== 'object')
            continue;
        if (typeof descriptor.name !== 'string' || typeof descriptor.handler !== 'function')
            continue;
        const jsonSchema = toJsonSchema(descriptor.inputSchema);
        server.registerTool(descriptor.name, descriptor.description, jsonSchema, descriptor.handler);
        registered.push(descriptor);
    }
    return registered;
}
//# sourceMappingURL=auto-discover.js.map