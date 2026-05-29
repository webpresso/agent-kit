/**
 * `wp mcp` stdio server.
 *
 * Builds an MCP {@link Server} and auto-registers every tool found under
 * `src/mcp/tools/` (or, post-build, `dist/esm/mcp/tools/`). Adding a new tool
 * is a matter of dropping a file with a default-exported {@link ToolDescriptor}
 * — no edits required here.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  RootsListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  discoverTools,
  type ContentBlock,
  type ToolAnnotations,
  type ToolHandler,
  type ToolRegistrar,
  registerToolDescriptors,
} from './auto-discover.js'
import { registerBlueprintServer } from './blueprint-server.js'
import { COMPILED_TOOL_REGISTRY } from './tools/_registry.js'
import { readOwnedPackageVersion } from '#runtime/package-version.js'

const SERVER_NAME = 'webpresso'

const SERVER_VERSION = readOwnedPackageVersion(import.meta.url)

interface RegisteredTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  handler: ToolHandler
  annotations?: ToolAnnotations
}

function defaultToolsDir(): string {
  // import.meta.url resolves to either src/mcp/server.ts (dev/test via vitest)
  // or dist/esm/mcp/server.js (built). The tools directory is colocated.
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, 'tools')
}

export type ToolLoadMode = 'filesystem' | 'registry'

function resolveDefaultToolLoadMode(): ToolLoadMode {
  return process.env.WP_MCP_TOOL_MODE === 'registry' || process.env.WP_COMPILED_RUNTIME === '1'
    ? 'registry'
    : 'filesystem'
}

export interface CreateServerOptions {
  /**
   * Directory to scan for tool descriptors. Defaults to `./tools` relative to
   * this module — i.e. `src/mcp/tools/` in dev and `dist/esm/mcp/tools/` after
   * `vp run build`.
   */
  toolsDir?: string
  /**
   * Tool loading strategy. Use `registry` for compiled runtime execution where
   * runtime directory scans are unsafe, and `filesystem` for dev/test disk
   * discovery.
   */
  toolLoadMode?: ToolLoadMode
  /**
   * Repo working directory passed through to the blueprint structured-store
   * registrar (Task 2.1). Defaults to `process.cwd()`. Tests inject a tmpdir.
   */
  cwd?: string
}

export async function createServer(options: CreateServerOptions = {}): Promise<Server> {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        tools: {},
        // Advertise (empty) prompts/resources so clients that unconditionally
        // list them during init don't fall through to a method-not-found path.
        prompts: { listChanged: false },
        resources: { listChanged: false },
      },
    },
  )

  const tools = new Map<string, RegisteredTool>()
  const registrar: ToolRegistrar = {
    registerTool(name, description, inputSchema, outputSchema, handler, annotations) {
      tools.set(name, { name, description, inputSchema, outputSchema, handler, annotations })
    },
  }

  const toolLoadMode = options.toolLoadMode ?? resolveDefaultToolLoadMode()
  if (toolLoadMode === 'registry') {
    registerToolDescriptors(registrar, COMPILED_TOOL_REGISTRY)
  } else {
    await discoverTools(registrar, options.toolsDir ?? defaultToolsDir())
  }

  // Task 2.1: register the blueprint structured-store tools AFTER auto-discover
  // so any tool-name collision surfaces here as a thrown error rather than
  // silent shadowing. Roots are looked up lazily via `server.listRoots()`; the
  // capability-missing throw is caught inside `registerBlueprintServer` so
  // tool listing still works in clients that don't advertise roots.
  const existingToolNames = new Set(tools.keys())
  await registerBlueprintServer(registrar, {
    cwd: options.cwd ?? process.cwd(),
    existingToolNames,
    getMcpRoots: () => server.listRoots(),
    onRootsListChanged: (handler) => {
      // F5: the SDK has no convenience `onRootsListChanged` property — the
      // notification handler must be installed explicitly. Capability-missing
      // clients simply never emit this notification, which is harmless.
      try {
        server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
          handler()
        })
      } catch {
        // Some test transports don't accept additional notification handlers;
        // failing to install is non-fatal — list-changed is an optimization.
      }
    },
  })

  // Empty prompts/resources/resource-templates handlers, registered exactly
  // like context-mode does (build/server.js:50-57). Several MCP clients —
  // including Claude Code 2.1.x and OpenCode — call listPrompts() or
  // listResources() during initialization. Without these handlers the SDK
  // returns -32601 Method Not Found, which **poisons the transport layer**
  // and causes subsequent listTools() calls to silently fail. The result:
  // `claude mcp list` reports "Connected" but no tools appear in the
  // session's deferred-tool registry. Fixed upstream by registering these.
  server.setRequestHandler(ListPromptsRequestSchema, () => ({ prompts: [] }))
  server.setRequestHandler(ListResourcesRequestSchema, () => ({ resources: [] }))
  server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({ resourceTemplates: [] }))

  server.setRequestHandler(ListToolsRequestSchema, () => {
    return {
      tools: [...tools.values()].map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
        ...(t.annotations ? { annotations: t.annotations } : {}),
      })),
    }
  })

  // The MCP SDK passes a `RequestHandlerExtra` as the second arg containing
  // `signal` (an AbortSignal that fires when the client cancels the call).
  // We forward only `signal` to keep the tool surface narrow — tools must
  // not depend on transport internals.
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params
    const tool = tools.get(name)
    if (!tool) {
      const errorBlock: ContentBlock = {
        type: 'text',
        text: `Unknown tool: ${name}`,
      }
      return { content: [errorBlock], isError: true }
    }
    const handlerExtra = extra?.signal ? { signal: extra.signal } : undefined
    try {
      const result = await tool.handler(args ?? {}, handlerExtra)
      return {
        content: result.content as ContentBlock[],
        ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}),
        isError: result.isError,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const errorBlock: ContentBlock = { type: 'text', text: message }
      return { content: [errorBlock], isError: true }
    }
  })

  return server
}
