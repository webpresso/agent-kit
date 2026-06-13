import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { SessionMemoryStore } from '#session-memory/store.js'
import type { SearchHit } from '#session-memory/types.js'
import { defaultIndexDbPath } from './session-restore.js'

const MAX_CAPTURE_BYTES = 1024 * 1024
const DEFAULT_SEARCH_LIMIT = 10

export interface SessionCommandResult {
  readonly label: string
  readonly exitCode: number
  readonly outputBytes: number
  readonly indexed: boolean
  readonly summary: string
}

interface RunSessionCommandOptions {
  readonly command: string
  readonly label: string
  readonly cwd: string
  readonly timeoutMs: number
  readonly dbPath?: string
}

function appendBounded(parts: Buffer[], chunk: Buffer, currentBytes: number): number {
  const nextBytes = currentBytes + chunk.length
  if (currentBytes >= MAX_CAPTURE_BYTES) return nextBytes
  const remaining = MAX_CAPTURE_BYTES - currentBytes
  parts.push(chunk.length <= remaining ? chunk : chunk.subarray(0, remaining))
  return nextBytes
}

function summarizeOutput(output: string, timedOut: boolean): string {
  const normalized = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join('\n')
  if (!normalized) return timedOut ? 'command timed out with no captured output' : 'no output'
  return normalized.length > 2_000 ? `${normalized.slice(0, 2_000)}…` : normalized
}

function commandChunkId(label: string, command: string, output: string): string {
  return createHash('sha256')
    .update(label)
    .update('\0')
    .update(command)
    .update('\0')
    .update(output)
    .digest('hex')
    .slice(0, 32)
}

export async function runSessionCommand({
  command,
  label,
  cwd,
  timeoutMs,
  dbPath = defaultIndexDbPath(cwd),
}: RunSessionCommandOptions): Promise<SessionCommandResult> {
  mkdirSync(dirname(dbPath), { recursive: true })
  const captured: Buffer[] = []
  let totalOutputBytes = 0
  let timedOut = false

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL')
      }, 1_000).unref()
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => {
      totalOutputBytes = appendBounded(captured, chunk, totalOutputBytes)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      totalOutputBytes = appendBounded(captured, chunk, totalOutputBytes)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (timedOut) {
        resolve(124)
        return
      }
      if (code !== null) {
        resolve(code)
        return
      }
      resolve(signal ? 128 : -1)
    })
  })

  const output = Buffer.concat(captured).toString('utf8')
  const truncated = totalOutputBytes > Buffer.byteLength(output, 'utf8')
  const summary = `${summarizeOutput(output, timedOut)}${truncated ? '\n[output truncated before indexing]' : ''}`
  const indexed = output.trim().length > 0
  if (indexed) {
    const store = new SessionMemoryStore(dbPath)
    try {
      store.indexChunk({
        id: `command:${commandChunkId(label, command, output)}`,
        source: label,
        text: output,
        metadata: {
          command,
          cwd,
          exitCode,
          outputBytes: totalOutputBytes,
          truncated,
          kind: 'session_command_output',
        },
      })
    } finally {
      store.close()
    }
  }
  return { label, exitCode, outputBytes: totalOutputBytes, indexed, summary }
}

export function searchSessionCommandOutput(
  dbPath: string,
  labels: readonly string[],
  query: string,
  limit: number = DEFAULT_SEARCH_LIMIT,
): SearchHit[] {
  const store = new SessionMemoryStore(dbPath)
  try {
    const hits = labels.flatMap((label) =>
      store
        .search({ query, limit, source: label })
        .filter((hit) => hit.source === label)
        .map((hit, index) => ({
          content: hit.text,
          source: hit.source,
          rank: index + 1,
          tier: hit.tier,
        })),
    )
    const deduped = new Map<string, SearchHit>()
    for (const hit of hits) {
      const key = `${hit.source}\0${hit.content}`
      if (!deduped.has(key)) deduped.set(key, hit)
    }
    return [...deduped.values()].slice(0, limit)
  } finally {
    store.close()
  }
}
