import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'

import { describe, expect, it } from 'vitest'

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
}

import { CodexAppServerClient } from './client.js'

class CaptureWritable extends Writable {
  readonly chunks: string[] = []

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(String(chunk))
    callback()
  }
}

class FakeChild extends EventEmitter {
  readonly stdin = new CaptureWritable()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  killed = false

  kill(): boolean {
    this.killed = true
    return true
  }

  lines(): string[] {
    return this.stdin.chunks.join('').trim().split('\n').filter(Boolean)
  }

  readJsonLines(): Array<Record<string, unknown>> {
    return this.lines().map((line) => JSON.parse(line) as Record<string, unknown>)
  }

  emitStdout(line: string): void {
    this.stdout.write(`${line}\n`)
  }

  endStdout(): void {
    this.stdout.end()
  }
}

describe('CodexAppServerClient', () => {
  it('sends initialize first, then initialized, then resolves later requests by matching id', async () => {
    const child = new FakeChild()
    const clientPromise = CodexAppServerClient.start({ spawn: () => child, timeoutMs: 50 })

    const [initializeRequest] = child.readJsonLines()
    expect(initializeRequest).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'webpresso_agent_kit' } },
    })

    child.emitStdout(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }))
    const client = await clientPromise

    const linesAfterReady = child.readJsonLines()
    expect(linesAfterReady[1]).toMatchObject({ method: 'initialized', params: {} })

    const hooksListPromise = client.hooksList(['/repo'])
    await flushMicrotasks()
    const hooksListRequest = child.readJsonLines()[2]
    expect(hooksListRequest).toMatchObject({
      id: 2,
      method: 'hooks/list',
      params: { cwds: ['/repo'] },
    })

    child.emitStdout(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: {
          data: [
            {
              cwd: '/repo',
              hooks: [],
              warnings: [],
              errors: [],
            },
          ],
        },
      }),
    )

    await expect(hooksListPromise).resolves.toMatchObject({ data: [{ cwd: '/repo' }] })
  })

  it('parses camelCase event names from hooks/list responses returned by the live app-server', async () => {
    const child = new FakeChild()
    const clientPromise = CodexAppServerClient.start({ spawn: () => child, timeoutMs: 50 })

    child.emitStdout(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }))
    const client = await clientPromise

    const hooksListPromise = client.hooksList(['/repo'])
    await flushMicrotasks()
    child.emitStdout(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: {
          data: [
            {
              cwd: '/repo',
              hooks: [
                {
                  key: '/repo/.codex/hooks.json:pre_tool_use:0:0',
                  eventName: 'preToolUse',
                  handlerType: 'command',
                  matcher: 'Bash',
                  command: 'node /pkg/bin/wp hook pretool-guard # wp-pretool-guard',
                  timeoutSec: 5,
                  statusMessage: null,
                  sourcePath: '/repo/.codex/hooks.json',
                  source: 'project',
                  pluginId: null,
                  displayOrder: 0,
                  enabled: true,
                  isManaged: false,
                  currentHash: 'sha256:abc123',
                  trustStatus: 'trusted',
                },
              ],
              warnings: [],
              errors: [],
            },
          ],
        },
      }),
    )

    await expect(hooksListPromise).resolves.toMatchObject({
      data: [{ hooks: [{ eventName: 'pre_tool_use' }] }],
    })
  })

  it('times out requests with method-aware diagnostics', async () => {
    const child = new FakeChild()
    const clientPromise = CodexAppServerClient.start({ spawn: () => child, timeoutMs: 10 })
    child.stderr.write('timeout stderr')
    child.emitStdout(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }))
    const client = await clientPromise

    await expect(client.hooksList(['/repo'])).rejects.toThrow(
      'hooks/list failed: Timed out after 10ms. stderr tail: timeout stderr',
    )
  })

  it('rejects invalid JSON from stdout with method and stderr context', async () => {
    const child = new FakeChild()
    const clientPromise = CodexAppServerClient.start({ spawn: () => child, timeoutMs: 50 })
    child.stderr.write('broken json stderr')
    child.emitStdout(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }))
    const client = await clientPromise

    const pending = client.hooksList(['/repo'])
    await flushMicrotasks()
    child.emitStdout('not-json')

    await expect(pending).rejects.toThrow(
      'hooks/list failed: transport failed: Codex app-server emitted invalid JSON: not-json. stderr tail: broken json stderr',
    )
  })

  it('rejects JSON-RPC error responses with method-aware diagnostics', async () => {
    const child = new FakeChild()
    const clientPromise = CodexAppServerClient.start({ spawn: () => child, timeoutMs: 50 })
    child.stderr.write('rpc stderr')
    child.emitStdout(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }))
    const client = await clientPromise

    const pending = client.hooksList(['/repo'])
    await flushMicrotasks()
    child.emitStdout(
      JSON.stringify({ jsonrpc: '2.0', id: 2, error: { code: -32602, message: 'bad cwds' } }),
    )

    await expect(pending).rejects.toThrow(
      'hooks/list failed: JSON-RPC error -32602: bad cwds. stderr tail: rpc stderr',
    )
  })

  it('rejects when stdout closes before a pending response arrives', async () => {
    const child = new FakeChild()
    const clientPromise = CodexAppServerClient.start({ spawn: () => child, timeoutMs: 50 })
    child.stderr.write('stdout closed stderr')
    child.emitStdout(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }))
    const client = await clientPromise

    const pending = client.hooksList(['/repo'])
    await flushMicrotasks()
    child.endStdout()

    await expect(pending).rejects.toThrow(
      'hooks/list failed: transport failed: Codex app-server stdout closed before response. stderr tail: stdout closed stderr',
    )
  })

  it('rejects when the child exits before a pending response arrives', async () => {
    const child = new FakeChild()
    const clientPromise = CodexAppServerClient.start({ spawn: () => child, timeoutMs: 50 })
    child.stderr.write('exit stderr')
    child.emitStdout(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }))
    const client = await clientPromise

    const pending = client.configBatchWrite({ edits: [], reloadUserConfig: true })
    await flushMicrotasks()
    child.emit('close', 1, null)

    await expect(pending).rejects.toThrow(
      'config/batchWrite failed: transport failed: Codex app-server exited before response (code 1). stderr tail: exit stderr',
    )
  })
})
