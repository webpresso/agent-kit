import { spawn } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const sourceToolsDir = resolve(repoRoot, 'src/mcp/tools')
const sourceCliPath = resolve(repoRoot, 'src/mcp/cli.ts')
const builtCliPath = resolve(repoRoot, 'dist/esm/mcp/cli.js')
const cliPath = existsSync(sourceCliPath) ? sourceCliPath : builtCliPath
const cliRuntime = cliPath.endsWith('.ts') ? 'bun' : 'node'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

const startedChildren: { kill: (signal?: NodeJS.Signals) => boolean }[] = []
afterAll(() => {
  for (const child of startedChildren) child.kill('SIGTERM')
})

async function callServer(...requests: JsonRpcRequest[]): Promise<JsonRpcResponse[]> {
  return new Promise((res, rej) => {
    const child = spawn(cliRuntime, [cliPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' },
    })
    startedChildren.push(child)

    let stdoutBuf = ''
    let stderrBuf = ''
    const responses: JsonRpcResponse[] = []
    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        child.kill('SIGTERM')
        rej(
          new Error(
            `MCP server timed out. stdout=${JSON.stringify(stdoutBuf)} stderr=${JSON.stringify(stderrBuf)}`,
          ),
        )
      }
    }, 15000)

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8')
      let nl = stdoutBuf.indexOf('\n')
      while (nl !== -1) {
        const line = stdoutBuf.slice(0, nl).trim()
        stdoutBuf = stdoutBuf.slice(nl + 1)
        if (line) {
          try {
            responses.push(JSON.parse(line))
          } catch {
            /* ignore non-JSON line */
          }
        }
        nl = stdoutBuf.indexOf('\n')
      }
      if (responses.length >= requests.length && !resolved) {
        resolved = true
        clearTimeout(timeout)
        child.kill('SIGTERM')
        res(responses)
      }
    })

    child.stderr.on('data', (c: Buffer) => {
      stderrBuf += c.toString('utf8')
    })

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        rej(err)
      }
    })

    for (const req of requests) {
      child.stdin.write(`${JSON.stringify(req)}\n`)
    }
    child.stdin.end()
  })
}

describe('mcp server integration', () => {
  if (!existsSync(cliPath)) {
    it.skip('skipped: MCP CLI entrypoint missing', () => {
      /* skip */
    })
    return
  }

  it('responds to tools/list with wp_test registered and a JSON Schema', async () => {
    const responses = await callServer(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'webpresso-test', version: '0.0.0' },
        },
      },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    )

    const listResponse = responses.find((r) => r.id === 2)
    expect(listResponse).toBeDefined()
    const tools = (listResponse?.result?.tools ?? []) as Array<{
      name: string
      description?: string
      inputSchema: { type: string; properties?: Record<string, unknown> }
      outputSchema?: { type: string; properties?: Record<string, unknown> }
    }>
    const akTest = tools.find((t) => t.name === 'wp_test')
    expect(akTest).toBeDefined()
    expect(akTest?.inputSchema.type).toBe('object')
    expect(akTest?.inputSchema.properties).toMatchObject({
      packages: expect.any(Object),
      files: expect.any(Object),
    })
    expect(akTest?.inputSchema.properties).not.toHaveProperty('backend')
    expect(akTest?.inputSchema.properties).not.toHaveProperty('suite')
    expect(akTest?.outputSchema?.properties).toMatchObject({
      passed: expect.any(Object),
      summary: expect.any(Object),
    })

    const akE2e = tools.find((t) => t.name === 'wp_e2e')
    expect(akE2e).toBeDefined()
    expect(akE2e?.inputSchema.properties).toMatchObject({
      suite: expect.any(Object),
      files: expect.any(Object),
      headed: expect.any(Object),
    })
    expect(akE2e?.outputSchema?.properties).toMatchObject({
      passed: expect.any(Object),
      summary: expect.any(Object),
      details: expect.any(Object),
    })

    const akAudit = tools.find((t) => t.name === 'wp_audit')
    expect(akAudit).toBeDefined()
    expect(
      (akAudit?.inputSchema.properties?.kind as { enum?: unknown[] } | undefined)?.enum ?? [],
    ).toContain('agents')
    expect(
      (akAudit?.inputSchema.properties?.kind as { enum?: unknown[] } | undefined)?.enum ?? [],
    ).toContain('architecture-drift')
  }, 20_000)

  // Regression: Claude Code 2.1.x and OpenCode call prompts/list and
  // resources/list during init. If the server returns -32601, the SDK
  // transport gets poisoned and subsequent tools/list calls silently fail
  // (anthropics/claude-code#36914, #42442, #45844). The workaround,
  // mirrored from context-mode, is to register empty handlers for these
  // methods. Without this fix, webpresso tools never surface in
  // Claude Code's deferred-tool registry.
  it('responds to prompts/list and resources/list without -32601 (transport-poisoning workaround)', async () => {
    const responses = await callServer(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'webpresso-test', version: '0.0.0' },
        },
      },
      { jsonrpc: '2.0', id: 2, method: 'prompts/list' },
      { jsonrpc: '2.0', id: 3, method: 'resources/list' },
      { jsonrpc: '2.0', id: 4, method: 'resources/templates/list' },
      { jsonrpc: '2.0', id: 5, method: 'tools/list' },
    )

    for (const id of [2, 3, 4, 5]) {
      const r = responses.find((res) => res.id === id)
      expect(r, `id=${id} response`).toBeDefined()
      expect(r?.error, `id=${id} should not error`).toBeUndefined()
    }
    expect(responses.find((r) => r.id === 2)?.result).toEqual({ prompts: [] })
    expect(responses.find((r) => r.id === 3)?.result).toEqual({ resources: [] })
    expect(responses.find((r) => r.id === 4)?.result).toEqual({ resourceTemplates: [] })
    // Most important: tools/list still works AFTER the prompts/resources calls.
    const tools = (responses.find((r) => r.id === 5)?.result?.tools ?? []) as Array<{
      name: string
    }>
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['wp_lint', 'wp_qa', 'wp_test', 'wp_e2e', 'wp_typecheck', 'wp_audit']),
    )
  }, 20_000)

  it('advertises prompts and resources capabilities so clients know to list them', async () => {
    const responses = await callServer({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'webpresso-test', version: '0.0.0' },
      },
    })
    const init = responses.find((r) => r.id === 1)
    const caps = init?.result?.capabilities as Record<string, unknown> | undefined
    expect(caps).toBeDefined()
    expect(caps).toHaveProperty('tools')
    expect(caps).toHaveProperty('prompts')
    expect(caps).toHaveProperty('resources')
  })

  it('passes through tool outputSchema in tools/list and structuredContent in tools/call', async () => {
    const filePath = resolve(sourceToolsDir, '__structured-content-plumbing-fixture.js')
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
      const responses = await callServer(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'webpresso-test', version: '0.0.0' },
          },
        },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'zz_structured_content_plumbing',
            arguments: { value: 'hi' },
          },
        },
      )

      const listResponse = responses.find((r) => r.id === 2)
      const tools = (listResponse?.result?.tools ?? []) as Array<{
        name: string
        outputSchema?: Record<string, unknown>
      }>
      const fixture = tools.find((t) => t.name === 'zz_structured_content_plumbing')
      expect(fixture?.outputSchema).toEqual({ type: 'object', bareShape: true })

      const callResponse = responses.find((r) => r.id === 3)
      expect(callResponse?.error).toBeUndefined()
      expect(callResponse?.result?.structuredContent).toEqual({
        ok: true,
        echoed: { value: 'hi' },
      })
      expect(callResponse?.result?.content).toEqual([
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
    const responses = await callServer(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'webpresso-test', version: '0.0.0' },
        },
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'wp_audit',
          arguments: { kind: 'docs-frontmatter', directory: process.cwd() },
        },
      },
    )

    const callResponse = responses.find((r) => r.id === 2)
    expect(callResponse?.error).toBeUndefined()
    expect(callResponse?.result?.structuredContent).toMatchObject({
      passed: expect.any(Boolean),
      summary: expect.any(String),
      kind: 'docs-frontmatter',
    })
    const textBlock = (
      callResponse?.result?.content as Array<{ type?: string; text?: string }> | undefined
    )?.[0]
    expect(textBlock?.type).toBe('text')
    expect(typeof textBlock?.text).toBe('string')
    expect(JSON.parse(textBlock!.text!)).toEqual(callResponse?.result?.structuredContent)
  })

  // Task 2.1: the structured blueprint surface (8 existing tools + the new
  // `wp_blueprint_projects` aggregate) must be advertised by the main server,
  // not just available via direct registrar tests.
  it('advertises the 9 structured blueprint tools in tools/list (Task 2.1)', async () => {
    const responses = await callServer(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'webpresso-test', version: '0.0.0' },
        },
      },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    )

    const tools = (responses.find((r) => r.id === 2)?.result?.tools ?? []) as Array<{
      name: string
    }>
    const names = tools.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'wp_blueprint_query',
        'wp_blueprint_new',
        'wp_blueprint_validate',
        'wp_blueprint_task_next',
        'wp_blueprint_task_advance',
        'wp_blueprint_promote',
        'wp_blueprint_finalize',
        'wp_blueprint_depgraph',
        'wp_blueprint_projects',
      ]),
    )
    // Auto-discovered non-blueprint tools must still be present alongside.
    expect(names).toEqual(expect.arrayContaining(['wp_lint', 'wp_qa', 'wp_test', 'wp_audit']))
  }, 20_000)
})
