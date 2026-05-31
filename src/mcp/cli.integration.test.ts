import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const PACKAGE_ROOT = resolve(import.meta.dirname, '..', '..')

let transport: StdioClientTransport | undefined
let client: Client | undefined

afterEach(async () => {
  await client?.close().catch(() => undefined)
  await transport?.close().catch(() => undefined)
  client = undefined
  transport = undefined
})

describe('wp mcp CLI integration', () => {
  it('initializes over stdio and lists registered tools without exiting early', async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(PACKAGE_ROOT, 'bin', 'wp.js'), 'mcp'],
      env: {
        ...process.env,
        WP_SKIP_UPDATE_CHECK: '1',
      },
    })
    client = new Client({ name: 'wp-mcp-integration-test', version: '0.0.0' })

    await client.connect(transport)
    const tools = await client.listTools()

    expect(tools.tools.map((tool) => tool.name)).toContain('wp_test')
    expect(tools.tools.map((tool) => tool.name)).toContain('wp_blueprint_list')
  }, 20_000)
})
