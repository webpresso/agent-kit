#!/usr/bin/env bun
/**
 * `ak mcp` — stdio MCP server entrypoint.
 *
 * Spins up the `agent-kit` MCP server with auto-discovered tools and connects
 * it to a stdio transport. Each tool is a single file under
 * `dist/esm/mcp/tools/*.js` (post-build) or `src/mcp/tools/*.ts` (dev).
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { deleteSentinel, writeSentinel } from '#hooks/shared/mcp-sentinel'

import { createServer } from './server.js'

export async function runStdioServer(): Promise<void> {
  const server = await createServer()
  const transport = new StdioServerTransport()

  let shuttingDown = false
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    deleteSentinel()
    try {
      await server.close()
    } catch {
      /* ignore close errors during shutdown */
    }
  }
  process.on('SIGINT', () => {
    void shutdown().then(() => process.exit(0))
  })
  process.on('SIGTERM', () => {
    void shutdown().then(() => process.exit(0))
  })

  await server.connect(transport)
  writeSentinel()
}

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const isDirectInvocation =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])

if (isDirectInvocation) {
  runStdioServer().catch((err: unknown) => {
    process.stderr.write(`ak mcp: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
