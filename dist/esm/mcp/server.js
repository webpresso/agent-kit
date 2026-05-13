/**
 * `ak mcp` stdio server.
 *
 * Builds an MCP {@link Server} and auto-registers every tool found under
 * `src/mcp/tools/` (or, post-build, `dist/esm/mcp/tools/`). Adding a new tool
 * is a matter of dropping a file with a default-exported {@link ToolDescriptor}
 * — no edits required here.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverTools, } from './auto-discover.js';
const SERVER_NAME = 'agent-kit';
// Walk upward from this module's location until we find package.json. Works
// for both src/mcp/server.ts (dev) and dist/esm/mcp/server.js (built) without
// hardcoding asymmetric `../../..` counts.
const MAX_UPWARD_LEVELS = 8;
function readPackageVersion() {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < MAX_UPWARD_LEVELS; i++) {
        const candidate = join(dir, 'package.json');
        if (existsSync(candidate)) {
            const pkg = JSON.parse(readFileSync(candidate, 'utf-8'));
            // Some build outputs emit a marker `package.json` (e.g. `{ "type": "module" }`)
            // without a version. Skip those and keep walking so we land on the real
            // package root, instead of throwing the moment we see any package.json.
            if (typeof pkg.version === 'string' && pkg.version.length > 0)
                return pkg.version;
        }
        const parent = dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    throw new Error('Cannot locate a versioned package.json relative to agent-kit MCP server module');
}
const SERVER_VERSION = readPackageVersion();
function defaultToolsDir() {
    // import.meta.url resolves to either src/mcp/server.ts (dev/test via vitest)
    // or dist/esm/mcp/server.js (built). The tools directory is colocated.
    const here = dirname(fileURLToPath(import.meta.url));
    return join(here, 'tools');
}
export async function createServer(options = {}) {
    const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, {
        capabilities: {
            tools: {},
            // Advertise (empty) prompts/resources so clients that unconditionally
            // list them during init don't fall through to a method-not-found path.
            prompts: { listChanged: false },
            resources: { listChanged: false },
        },
    });
    const tools = new Map();
    const registrar = {
        registerTool(name, description, inputSchema, outputSchema, handler, annotations) {
            tools.set(name, { name, description, inputSchema, outputSchema, handler, annotations });
        },
    };
    await discoverTools(registrar, options.toolsDir ?? defaultToolsDir());
    // Empty prompts/resources/resource-templates handlers, registered exactly
    // like context-mode does (build/server.js:50-57). Several MCP clients —
    // including Claude Code 2.1.x and OpenCode — call listPrompts() or
    // listResources() during initialization. Without these handlers the SDK
    // returns -32601 Method Not Found, which **poisons the transport layer**
    // and causes subsequent listTools() calls to silently fail. The result:
    // `claude mcp list` reports "Connected" but no tools appear in the
    // session's deferred-tool registry. Fixed upstream by registering these.
    server.setRequestHandler(ListPromptsRequestSchema, () => ({ prompts: [] }));
    server.setRequestHandler(ListResourcesRequestSchema, () => ({ resources: [] }));
    server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({ resourceTemplates: [] }));
    server.setRequestHandler(ListToolsRequestSchema, () => {
        return {
            tools: [...tools.values()].map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
                ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
                ...(t.annotations ? { annotations: t.annotations } : {}),
            })),
        };
    });
    // The MCP SDK passes a `RequestHandlerExtra` as the second arg containing
    // `signal` (an AbortSignal that fires when the client cancels the call).
    // We forward only `signal` to keep the tool surface narrow — tools must
    // not depend on transport internals.
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
        const { name, arguments: args } = request.params;
        const tool = tools.get(name);
        if (!tool) {
            const errorBlock = {
                type: 'text',
                text: `Unknown tool: ${name}`,
            };
            return { content: [errorBlock], isError: true };
        }
        const handlerExtra = extra?.signal ? { signal: extra.signal } : undefined;
        try {
            const result = await tool.handler(args ?? {}, handlerExtra);
            return {
                content: result.content,
                ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}),
                isError: result.isError,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const errorBlock = { type: 'text', text: message };
            return { content: [errorBlock], isError: true };
        }
    });
    return server;
}
//# sourceMappingURL=server.js.map