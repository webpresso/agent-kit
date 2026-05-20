import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'ak-blueprint-wal-'))
  tempRoots.push(root)
  return root
}

function resolveBunPath(): string {
  const fromEnv = process.env.BUN_PATH
  if (fromEnv) return fromEnv
  // Look up bun from PATH so the test works on both macOS and Linux CI runners.
  const which = spawnSync('which', ['bun'], { encoding: 'utf8' })
  const fromPath = which.stdout.trim()
  if (fromPath) return fromPath
  // Last-resort well-known locations
  return '/opt/homebrew/bin/bun'
}

type WorkerResult = {
  code: number
  stdout: string
  stderr: string
}

async function runWorkerScript(
  cwd: string,
  scriptPath: string,
  args: readonly string[],
): Promise<WorkerResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(resolveBunPath(), [scriptPath, ...args], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ code: code ?? -1, stdout, stderr })
    })
  })
}

async function readCount(cwd: string, dbPath: string, sql: string, key: string): Promise<number> {
  const readerScript = path.join(
    createTempRoot(),
    `reader-${Math.random().toString(36).slice(2)}.ts`,
  )
  writeFileSync(
    readerScript,
    `import { openDb } from ${JSON.stringify(path.join(import.meta.dirname, 'connection.ts'))}

const [dbPath] = process.argv.slice(2)
if (!dbPath) throw new Error('missing dbPath')
const conn = openDb(dbPath)
try {
  const row = conn.db.prepare(${JSON.stringify(sql)}).get()
  console.log(JSON.stringify(row))
} finally {
  conn.close()
}
`,
    'utf8',
  )
  const result = await runWorkerScript(cwd, readerScript, [dbPath])
  expect(result.code, result.stderr).toBe(0)
  const parsed = JSON.parse(result.stdout) as Record<string, number>
  return parsed[key] ?? 0
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('shared SQLite WAL multi-window safety', () => {
  it('persists all runner_events rows across 4 concurrent writer processes for 10 runs', async () => {
    const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')
    const workerScript = path.join(createTempRoot(), 'runner-events-worker.ts')
    writeFileSync(
      workerScript,
      `import { openDb } from ${JSON.stringify(path.join(import.meta.dirname, 'connection.ts'))}

const [dbPath, workerId, countArg] = process.argv.slice(2)
if (!dbPath || !workerId || !countArg) throw new Error('missing args')
const count = Number.parseInt(countArg, 10)
const conn = openDb(dbPath)
try {
  const stmt = conn.db.prepare(
    'INSERT INTO runner_events (execution_handle, sequence, kind, message) VALUES (?, ?, ?, ?)',
  )
  for (let i = 0; i < count; i += 1) {
    stmt.run(\`worker-\${workerId}\`, i, 'log', \`message-\${workerId}-\${i}\`)
  }
} finally {
  conn.close()
}
`,
      'utf8',
    )

    for (let run = 0; run < 10; run += 1) {
      const root = createTempRoot()
      const dbPath = path.join(root, 'wal-runner-events.db')
      const workers = await Promise.all(
        Array.from({ length: 4 }, (_, index) =>
          runWorkerScript(repoRoot, workerScript, [dbPath, String(index), '25']),
        ),
      )

      for (const worker of workers) {
        expect(worker.code, worker.stderr).toBe(0)
        expect(worker.stderr).not.toContain('SQLITE_BUSY')
        expect(worker.stderr).not.toContain('database is locked')
      }

      expect(
        await readCount(repoRoot, dbPath, 'SELECT COUNT(*) as count FROM runner_events', 'count'),
      ).toBe(100)
    }
  }, 120_000)

  it('persists all blueprint rows across 4 concurrent writer processes for 10 runs', async () => {
    const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')
    const workerScript = path.join(createTempRoot(), 'blueprints-worker.ts')
    writeFileSync(
      workerScript,
      `import { openDb } from ${JSON.stringify(path.join(import.meta.dirname, 'connection.ts'))}

const [dbPath, workerId, countArg] = process.argv.slice(2)
if (!dbPath || !workerId || !countArg) throw new Error('missing args')
const count = Number.parseInt(countArg, 10)
const conn = openDb(dbPath)
try {
  const stmt = conn.db.prepare(
    'INSERT INTO blueprints (slug, title, status, file_path, byte_size, content_hash, ingested_at, organization, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  for (let i = 0; i < count; i += 1) {
    const slug = \`worker-\${workerId}-bp-\${i}\`
    stmt.run(
      slug,
      \`Blueprint \${workerId}-\${i}\`,
      'planned',
      \`blueprints/\${slug}.md\`,
      100,
      \`hash-\${workerId}-\${i}\`,
      Date.now(),
      'test-org',
      'private',
    )
  }
} finally {
  conn.close()
}
`,
      'utf8',
    )

    for (let run = 0; run < 10; run += 1) {
      const root = createTempRoot()
      const dbPath = path.join(root, 'wal-blueprints.db')
      const workers = await Promise.all(
        Array.from({ length: 4 }, (_, index) =>
          runWorkerScript(repoRoot, workerScript, [dbPath, String(index), '25']),
        ),
      )

      for (const worker of workers) {
        expect(worker.code, worker.stderr).toBe(0)
        expect(worker.stderr).not.toContain('SQLITE_BUSY')
        expect(worker.stderr).not.toContain('database is locked')
      }

      expect(
        await readCount(
          repoRoot,
          dbPath,
          "SELECT COUNT(*) as count FROM blueprints WHERE slug LIKE 'worker-%'",
          'count',
        ),
      ).toBe(100)
    }
  }, 120_000)
})
