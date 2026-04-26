import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const cliPath = resolve(repoRoot, 'dist/esm/mcp/cli.js')

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

async function callServer(
  ...requests: JsonRpcRequest[]
): Promise<JsonRpcResponse[]> {
  return new Promise((res, rej) => {
    const child = spawn('node', [cliPath], {
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
    }, 8000)

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
  })
}

describe('mcp server integration', () => {
  if (!existsSync(cliPath)) {
    it.skip('skipped: dist/esm/mcp/cli.js missing — run `pnpm build` first', () => {
      /* skip */
    })
    return
  }

  it('responds to tools/list with ak_test registered and a JSON Schema', async () => {
    const responses = await callServer(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'agent-kit-test', version: '0.0.0' },
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
    }>
    const akTest = tools.find((t) => t.name === 'ak_test')
    expect(akTest).toBeDefined()
    expect(akTest?.inputSchema.type).toBe('object')
    expect(akTest?.inputSchema.properties).toMatchObject({
      packages: expect.any(Object),
      files: expect.any(Object),
      suite: expect.any(Object),
      backend: expect.any(Object),
    })
  })
})
