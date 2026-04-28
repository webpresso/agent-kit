/**
 * `ak mcp` stdio server.
 *
 * Builds an MCP {@link Server} and auto-registers every tool found under
 * `src/mcp/tools/` (or, post-build, `dist/esm/mcp/tools/`). Adding a new tool
 * is a matter of dropping a file with a default-exported {@link ToolDescriptor}
 * — no edits required here.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverTools, } from './auto-discover.js';
const SERVER_NAME = 'agent-kit';
const SERVER_VERSION = '0.1.0';
function defaultToolsDir() {
    // import.meta.url resolves to either src/mcp/server.ts (dev/test via vitest)
    // or dist/esm/mcp/server.js (built). The tools directory is colocated.
    const here = dirname(fileURLToPath(import.meta.url));
    return join(here, 'tools');
}
export async function createServer(options = {}) {
    const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });
    const tools = new Map();
    const registrar = {
        registerTool(name, description, inputSchema, handler) {
            tools.set(name, { name, description, inputSchema, handler });
        },
    };
    await discoverTools(registrar, options.toolsDir ?? defaultToolsDir());
    server.setRequestHandler(ListToolsRequestSchema, () => {
        return {
            tools: [...tools.values()].map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
            })),
        };
    });
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const tool = tools.get(name);
        if (!tool) {
            const errorBlock = {
                type: 'text',
                text: `Unknown tool: ${name}`,
            };
            return { content: [errorBlock], isError: true };
        }
        try {
            const result = await tool.handler(args ?? {});
            return {
                content: result.content,
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