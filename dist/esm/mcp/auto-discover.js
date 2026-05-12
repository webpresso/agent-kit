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
function isPlainObjectSchema(value) {
    return Boolean(value) && typeof value === 'object' && Object.keys(value).length > 1;
}
/**
 * Convert a tool's zod input schema to a JSON Schema for MCP. Prefers zod v4's
 * native `toJSONSchema` (the package pins ^4.3.6); falls through to the
 * `zod-to-json-schema` v3 adapter; and finally throws — silent fallback to a
 * permissive `{type:'object'}` would mask schema bugs by accepting any input.
 *
 * The lone permitted fallback is for *bare-shape* descriptors used by tests
 * (`{ _def, parse }` ducks that aren't zod instances). Those cannot be
 * auto-converted; we still mark them explicitly via `bareShape: true` rather
 * than silently producing an empty schema, so the MCP client sees the
 * limitation.
 */
// Real zod v4 schemas carry an internal `_zod` marker. The bare-shape ducks
// used by `auto-discover.test.ts` (`{ _def, parse }`) do not — discriminate
// on that to keep philosophy gates intact: bare shapes get an explicit
// `bareShape: true` JSON Schema (no silent fallback), and neither input
// reaches an exception-swallowing try/catch.
function isZodV4Instance(schema) {
    return Boolean(schema) && typeof schema === 'object' && '_zod' in schema;
}
function isBareShapeDuck(schema) {
    return (Boolean(schema) &&
        typeof schema === 'object' &&
        '_def' in schema &&
        'parse' in schema);
}
function toJsonSchema(schema) {
    if (isZodV4Instance(schema)) {
        const ztoj = z
            .toJSONSchema;
        if (typeof ztoj === 'function') {
            const result = ztoj(schema);
            if (isPlainObjectSchema(result))
                return result;
        }
        const v3Result = zodToJsonSchema(schema);
        if (isPlainObjectSchema(v3Result))
            return v3Result;
        throw new Error('Cannot derive JSON Schema from zod schema — ' +
            'neither zod v4 toJSONSchema nor zod-to-json-schema produced a usable result');
    }
    if (isBareShapeDuck(schema)) {
        return { type: 'object', bareShape: true };
    }
    throw new Error('Tool input schema is neither a zod schema nor a recognised bare shape');
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
        if (!descriptor || typeof descriptor !== 'object') {
            throw new Error(`Tool file ${fullPath} has no default export`);
        }
        if (typeof descriptor.name !== 'string' || typeof descriptor.handler !== 'function') {
            throw new Error(`Tool file ${fullPath} default export is malformed (missing name or handler)`);
        }
        const jsonSchema = toJsonSchema(descriptor.inputSchema);
        const outputSchema = descriptor.outputSchema ? toJsonSchema(descriptor.outputSchema) : undefined;
        server.registerTool(descriptor.name, descriptor.description, jsonSchema, outputSchema, descriptor.handler, descriptor.annotations);
        registered.push(descriptor);
    }
    return registered;
}
//# sourceMappingURL=auto-discover.js.map