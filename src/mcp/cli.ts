#!/usr/bin/env bun
/**
 * `wp mcp` — stdio MCP server entrypoint.
 *
 * Spins up the `webpresso` MCP server with auto-discovered tools and connects
 * it to a stdio transport. Each tool is a single file under
 * `dist/esm/mcp/tools/*.js` (post-build) or `src/mcp/tools/*.ts` (dev).
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { isDirectEntrypoint } from "#hooks/shared/direct-entrypoint";
import { deleteSentinel, writeSentinel } from "#hooks/shared/mcp-sentinel";

import { createServer } from "./server.js";

export async function runStdioServer(): Promise<void> {
  const server = await createServer();
  const transport = new StdioServerTransport();
  const settle = Promise.withResolvers<void>();

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    deleteSentinel();
    try {
      await transport.close();
    } catch {
      /* ignore transport close errors during shutdown */
    }
    try {
      await server.close();
    } catch {
      /* ignore close errors during shutdown */
    }
    settle.resolve();
  };
  process.on("SIGINT", () => {
    void shutdown().then(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().then(() => process.exit(0));
  });
  process.stdin.on("end", () => {
    void shutdown();
  });
  process.stdin.on("close", () => {
    void shutdown();
  });
  transport.onclose = () => {
    void shutdown();
  };
  transport.onerror = () => {
    void shutdown();
  };

  await server.connect(transport);
  writeSentinel();
  await settle.promise;
}

if (isDirectEntrypoint(import.meta.url)) {
  runStdioServer().catch((err: unknown) => {
    process.stderr.write(`wp mcp: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
