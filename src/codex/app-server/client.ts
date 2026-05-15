import { spawn } from 'node:child_process'

import {
  ConfigBatchWriteParamsSchema,
  ConfigBatchWriteResponseSchema,
  HooksListResponseSchema,
  JsonRpcErrorSchema,
  type CodexAppServerApi,
  type ConfigBatchWriteParams,
  type ConfigBatchWriteResponse,
  type HooksListResponse,
} from './types.js'

interface JsonRpcSuccess {
  readonly jsonrpc?: unknown
  readonly id?: unknown
  readonly result?: unknown
}

interface JsonRpcFailure {
  readonly jsonrpc?: unknown
  readonly id?: unknown
  readonly error?: unknown
}

interface ChildProcessLike {
  readonly stdin: {
    write(chunk: string, callback?: (error?: Error | null) => void): boolean
    end(chunk?: string, callback?: () => void): void
    on?(event: 'error', listener: (error: Error) => void): unknown
  }
  readonly stdout: NodeJS.ReadableStream
  readonly stderr?: NodeJS.ReadableStream | null
  kill(signal?: NodeJS.Signals | number): boolean
  on(event: 'error', listener: (error: Error) => void): this
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
}

type SpawnLike = (
  command: string,
  args: readonly string[],
  options: { cwd?: string; stdio: ['pipe', 'pipe', 'pipe'] },
) => ChildProcessLike

interface PendingRequest {
  readonly method: string
  readonly parse: (value: unknown) => unknown
  readonly resolve: (value: unknown) => void
  readonly reject: (error: Error) => void
  readonly timer: ReturnType<typeof setTimeout>
}

export interface CodexAppServerClientOptions {
  readonly command?: string
  readonly cwd?: string
  readonly spawn?: SpawnLike
  readonly timeoutMs?: number
}

const DEFAULT_PROTOCOL_VERSION = '2025-09-22'
const DEFAULT_TIMEOUT_MS = 5_000
const STDERR_TAIL_LIMIT = 400

export class CodexAppServerClient implements CodexAppServerApi {
  private readonly child: ChildProcessLike
  private readonly timeoutMs: number
  private readonly pending = new Map<number, PendingRequest>()
  private readonly ready: Promise<void>
  private nextId = 1
  private stdoutBuffer = ''
  private stderrBuffer = ''
  private closed = false
  private fatalError: Error | null = null

  private constructor(child: ChildProcessLike, timeoutMs: number) {
    this.child = child
    this.timeoutMs = timeoutMs
    this.attachListeners()
    this.ready = this.initialize()
  }

  static async start(options: CodexAppServerClientOptions = {}): Promise<CodexAppServerClient> {
    const spawnProcess = options.spawn ?? defaultSpawn
    const child = spawnProcess(options.command ?? 'codex', ['app-server', '--listen', 'stdio://'], {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const client = new CodexAppServerClient(child, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    await client.ready
    return client
  }

  async hooksList(cwds: string[]): Promise<HooksListResponse> {
    await this.ready
    return this.request('hooks/list', { cwds }, HooksListResponseSchema.parse)
  }

  async configBatchWrite(params: ConfigBatchWriteParams): Promise<ConfigBatchWriteResponse> {
    await this.ready
    const validatedParams = ConfigBatchWriteParamsSchema.parse(params)
    return this.request('config/batchWrite', validatedParams, ConfigBatchWriteResponseSchema.parse)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    const waitForClose = new Promise<void>((resolve) => {
      this.child.on('close', () => resolve())
    })
    this.child.stdin.end()
    this.child.kill('SIGTERM')
    this.rejectAll(new Error('Codex app-server client closed before response'))
    await waitForClose.catch(() => undefined)
  }

  private attachListeners(): void {
    this.child.stdout.on('data', (chunk) => {
      this.stdoutBuffer += String(chunk)
      this.drainStdoutBuffer()
    })
    this.child.stdout.on('end', () => {
      this.failTransport(new Error('Codex app-server stdout closed before response'))
    })
    this.child.stderr?.on('data', (chunk) => {
      this.stderrBuffer = `${this.stderrBuffer}${String(chunk)}`.slice(-STDERR_TAIL_LIMIT)
    })
    // stdin EPIPE — surface as a transport failure rather than letting Node's
    // default error handler bubble it up as an uncaught exception when the
    // child exits before we finish writing the request line.
    this.child.stdin.on?.('error', (error) => {
      this.failTransport(new Error(`Codex app-server stdin error: ${error.message}`))
    })
    this.child.on('error', (error) => {
      this.failTransport(new Error(`Codex app-server transport error: ${error.message}`))
    })
    this.child.on('close', (code, signal) => {
      if (this.closed && this.pending.size === 0) return
      const suffix = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`
      this.failTransport(new Error(`Codex app-server exited before response (${suffix})`))
    })
  }

  private drainStdoutBuffer(): void {
    let newlineIndex = this.stdoutBuffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1)
      if (line.length > 0) this.handleStdoutLine(line)
      newlineIndex = this.stdoutBuffer.indexOf('\n')
    }
  }

  private handleStdoutLine(line: string): void {
    let parsed: JsonRpcSuccess | JsonRpcFailure
    try {
      parsed = JSON.parse(line) as JsonRpcSuccess | JsonRpcFailure
    } catch {
      this.failTransport(new Error(`Codex app-server emitted invalid JSON: ${line.slice(0, 120)}`))
      return
    }

    if (!('id' in parsed) || typeof parsed.id !== 'number') return
    const pending = this.pending.get(parsed.id)
    if (!pending) return
    this.pending.delete(parsed.id)
    clearTimeout(pending.timer)

    if ('error' in parsed && parsed.error !== undefined) {
      const error = JsonRpcErrorSchema.safeParse(parsed.error)
      if (error.success) {
        pending.reject(
          new Error(
            this.decorateErrorMessage(
              pending.method,
              `JSON-RPC error ${error.data.code}: ${error.data.message}`,
            ),
          ),
        )
        return
      }

      pending.reject(
        new Error(this.decorateErrorMessage(pending.method, 'JSON-RPC error response was invalid')),
      )
      return
    }

    if (!('result' in parsed)) {
      pending.reject(
        new Error(this.decorateErrorMessage(pending.method, 'Missing JSON-RPC result')),
      )
      return
    }

    try {
      pending.resolve(pending.parse(parsed.result))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      pending.reject(
        new Error(
          this.decorateErrorMessage(pending.method, `Invalid response payload: ${message}`),
        ),
      )
    }
  }

  private async initialize(): Promise<void> {
    await this.request(
      'initialize',
      {
        protocolVersion: DEFAULT_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: 'webpresso_agent_kit',
          version: '0.0.0',
        },
      },
      (_value) => undefined,
    )
    this.notify('initialized', {})
  }

  private notify(method: string, params: unknown): void {
    if (this.fatalError) throw this.fatalError
    this.child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`,
      (error?: Error | null) => {
        if (error) this.failTransport(new Error(this.decorateErrorMessage(method, error.message)))
      },
    )
  }

  private request<T>(method: string, params: unknown, parse: (value: unknown) => T): Promise<T> {
    if (this.fatalError) return Promise.reject(this.fatalError)
    const id = this.nextId
    this.nextId += 1

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(this.decorateErrorMessage(method, `Timed out after ${this.timeoutMs}ms`)))
      }, this.timeoutMs)

      this.pending.set(id, {
        method,
        parse: (value: unknown) => parse(value),
        resolve: (value: unknown) => resolve(value as T),
        reject,
        timer,
      })
      this.child.stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
        (error?: Error | null) => {
          if (!error) return
          const pending = this.pending.get(id)
          if (!pending) return
          this.pending.delete(id)
          clearTimeout(timer)
          reject(new Error(this.decorateErrorMessage(method, error.message)))
        },
      )
    })
  }

  private decorateErrorMessage(method: string, detail: string): string {
    const stderrTail = this.stderrBuffer.trim()
    return stderrTail.length > 0
      ? `${method} failed: ${detail}. stderr tail: ${stderrTail}`
      : `${method} failed: ${detail}`
  }

  private failTransport(error: Error): void {
    if (this.fatalError) return
    this.fatalError = new Error(this.decorateErrorMessage('transport', error.message))
    this.rejectAll(this.fatalError)
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(this.decorateErrorMessage(pending.method, error.message)))
    }
    this.pending.clear()
  }
}

function defaultSpawn(
  command: string,
  args: readonly string[],
  options: { cwd?: string; stdio: ['pipe', 'pipe', 'pipe'] },
): ChildProcessLike {
  const child = spawn(command, [...args], options)
  if (!child.stdin || !child.stdout || !child.stderr) {
    throw new Error('Codex app-server requires piped stdin/stdout/stderr')
  }
  return child as unknown as ChildProcessLike
}
