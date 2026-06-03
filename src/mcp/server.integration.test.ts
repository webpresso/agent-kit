import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const sourceToolsDir = resolve(repoRoot, 'src/mcp/tools')
const sourceCliPath = resolve(repoRoot, 'src/mcp/cli.ts')
const builtCliPath = resolve(repoRoot, 'dist/esm/mcp/cli.js')
const cliPath = existsSync(sourceCliPath) ? sourceCliPath : builtCliPath
const cliRuntime = cliPath.endsWith('.ts') ? 'bun' : 'node'

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StdioClientTransport({
    command: cliRuntime,
    args: [cliPath],
    env: { ...process.env, NODE_ENV: 'test' },
  })
  const client = new Client({ name: 'webpresso-test', version: '0.0.0' })

  try {
    await client.connect(transport)
    return await fn(client)
  } finally {
    await client.close().catch(() => undefined)
    await transport.close().catch(() => undefined)
  }
}

describe('mcp server integration', () => {
  if (!existsSync(cliPath)) {
    it.skip('skipped: MCP CLI entrypoint missing', () => {
      /* skip */
    })
    return
  }

  it('responds to tools/list with wp_test registered and a JSON Schema', async () => {
    const tools = await withClient(
      async (client) =>
        (await client.listTools()).tools as Array<{
          name: string
          description?: string
          inputSchema: { type: string; properties?: Record<string, unknown> }
          outputSchema?: { type: string; properties?: Record<string, unknown> }
        }>,
    )
    const wpTest = tools.find((t) => t.name === 'wp_test')
    expect(wpTest).toBeDefined()
    expect(wpTest?.inputSchema.type).toBe('object')
    expect(wpTest?.inputSchema.properties).toMatchObject({
      packages: expect.any(Object),
      files: expect.any(Object),
    })
    expect(wpTest?.inputSchema.properties).not.toHaveProperty('backend')
    expect(wpTest?.inputSchema.properties).not.toHaveProperty('suite')
    expect(wpTest?.outputSchema?.properties).toMatchObject({
      passed: expect.any(Object),
      summary: expect.any(Object),
    })

    const wpE2e = tools.find((t) => t.name === 'wp_e2e')
    expect(wpE2e).toBeDefined()
    expect(wpE2e?.inputSchema.properties).toMatchObject({
      suite: expect.any(Object),
      files: expect.any(Object),
      headed: expect.any(Object),
    })
    expect(wpE2e?.outputSchema?.properties).toMatchObject({
      passed: expect.any(Object),
      summary: expect.any(Object),
      details: expect.any(Object),
    })

    const wpAudit = tools.find((t) => t.name === 'wp_audit')
    expect(wpAudit).toBeDefined()
    expect(
      (wpAudit?.inputSchema.properties?.kind as { enum?: unknown[] } | undefined)?.enum ?? [],
    ).toContain('agents')
    expect(
      (wpAudit?.inputSchema.properties?.kind as { enum?: unknown[] } | undefined)?.enum ?? [],
    ).toContain('architecture-drift')
    expect(
      (wpAudit?.inputSchema.properties?.kind as { enum?: unknown[] } | undefined)?.enum ?? [],
    ).toContain('no-first-party-mjs')

    const names = tools.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining(['wp_worker_tail', 'wp_ci_act', 'wp_lint', 'wp_qa', 'wp_typecheck']),
    )
    expect(names.filter((name) => name.startsWith('ak_'))).toEqual([])
  }, 20_000)

  // Regression: Claude Code 2.1.x and OpenCode call prompts/list and
  // resources/list during init. If the server returns -32601, the SDK
  // transport gets poisoned and subsequent tools/list calls silently fail
  // (anthropics/claude-code#36914, #42442, #45844). The workaround,
  // mirrored from context-mode, is to register empty handlers for these
  // methods. Without this fix, webpresso tools never surface in
  // Claude Code's deferred-tool registry.
  it('responds to prompts/list and resources/list without -32601 (transport-poisoning workaround)', async () => {
    const { prompts, resources, resourceTemplates, tools } = await withClient(async (client) => ({
      prompts: await client.listPrompts(),
      resources: await client.listResources(),
      resourceTemplates: await client.listResourceTemplates(),
      tools: (await client.listTools()).tools as Array<{
        name: string
      }>,
    }))

    expect(prompts).toMatchObject({ prompts: [] })
    expect(resources).toMatchObject({ resources: [] })
    expect(resourceTemplates).toMatchObject({ resourceTemplates: [] })
    const listedTools = tools as Array<{
      name: string
    }>
    expect(listedTools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['wp_lint', 'wp_qa', 'wp_test', 'wp_e2e', 'wp_typecheck', 'wp_audit']),
    )
  }, 20_000)

  it('advertises prompts and resources capabilities so clients know to list them', async () => {
    const caps = await withClient(async (client) => client.getServerCapabilities())
    expect(caps).toBeDefined()
    expect(caps).toHaveProperty('tools')
    expect(caps).toHaveProperty('prompts')
    expect(caps).toHaveProperty('resources')
  })

  it('passes through tool outputSchema in tools/list and structuredContent in tools/call', async () => {
    const filePath = resolve(sourceToolsDir, 'zz-structured-content-plumbing-fixture.js')
    writeFileSync(
      filePath,
      [
        'const fakeShape = { _def: { typeName: "ZodObject", shape: () => ({}) }, parse: (x) => x }',
        'export default {',
        '  name: "zz_structured_content_plumbing",',
        '  description: "fixture for MCP structured plumbing",',
        '  inputSchema: fakeShape,',
        '  outputSchema: fakeShape,',
        '  handler: async (input) => {',
        '    const payload = { ok: true, echoed: input }',
        '    return {',
        '      content: [{ type: "text", text: JSON.stringify(payload) }],',
        '      structuredContent: payload,',
        '    }',
        '  },',
        '}',
      ].join('\n'),
    )

    try {
      const { tools, callResponse } = await withClient(async (client) => ({
        tools: (await client.listTools()).tools as Array<{
          name: string
          outputSchema?: Record<string, unknown>
        }>,
        callResponse: await client.callTool({
          name: 'zz_structured_content_plumbing',
          arguments: { value: 'hi' },
        }),
      }))
      const fixture = tools.find((t) => t.name === 'zz_structured_content_plumbing')
      expect(fixture?.outputSchema).toEqual({ type: 'object', bareShape: true })

      expect(callResponse.structuredContent).toEqual({
        ok: true,
        echoed: { value: 'hi' },
      })
      expect(callResponse.content).toEqual([
        {
          type: 'text',
          text: '{"ok":true,"echoed":{"value":"hi"}}',
        },
      ])
    } finally {
      rmSync(filePath, { force: true })
    }
  }, 20_000)

  it('returns structuredContent for a real built-in tool with outputSchema', async () => {
    const callResponse = await withClient((client) =>
      client.callTool({
        name: 'wp_audit',
        arguments: { kind: 'docs-frontmatter', directory: process.cwd() },
      }),
    )

    expect(callResponse.structuredContent).toMatchObject({
      passed: expect.any(Boolean),
      summary: expect.any(String),
      kind: 'docs-frontmatter',
    })
    const textBlock = (
      callResponse.content as Array<{ type?: string; text?: string }> | undefined
    )?.[0]
    expect(textBlock?.type).toBe('text')
    expect(typeof textBlock?.text).toBe('string')
    expect(textBlock?.text).toBe(callResponse.structuredContent?.summary)
    expect(() => JSON.parse(textBlock!.text!)).toThrow()
  })

  // Task 2.1: the structured blueprint surface (8 existing tools + the new
  // `wp_blueprint_projects` aggregate) must be advertised by the main server,
  // not just available via direct registrar tests.
  it('advertises the 9 structured blueprint tools in tools/list (Task 2.1)', async () => {
    const tools = await withClient(
      async (client) =>
        (await client.listTools()).tools as Array<{
          name: string
        }>,
    )
    const names = tools.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'wp_blueprint_query',
        'wp_blueprint_new',
        'wp_blueprint_put',
        'wp_blueprint_transition',
        'wp_blueprint_validate',
        'wp_blueprint_task_next',
        'wp_blueprint_task_advance',
        'wp_blueprint_promote',
        'wp_blueprint_finalize',
        'wp_blueprint_depgraph',
        'wp_blueprint_projects',
      ]),
    )
    expect(names).not.toEqual(
      expect.arrayContaining([
        'wp_blueprint_put',
        'wp_blueprint_patch',
        'wp_blueprint_write_markdown',
      ]),
    )
    // Auto-discovered non-blueprint tools must still be present alongside.
    expect(names).toEqual(expect.arrayContaining(['wp_lint', 'wp_qa', 'wp_test', 'wp_audit']))
  }, 20_000)
})
