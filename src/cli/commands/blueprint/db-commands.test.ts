import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dbBuild, dbVerify, dbQuery, dbBrowse, executeBlueprintDbSubcommand } from './db-commands.js'
import { openDb } from '#db/connection.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BLUEPRINT_PLANNED = `---
type: blueprint
status: planned
complexity: S
owner: alice
created: '2026-01-15'
last_updated: '2026-04-01'
tags:
  - testing
depends_on: []
---

# My Planned Feature

Minimal fixture blueprint for db-commands tests.

#### Task 1.1: Do the thing
**Status:** todo
- [ ] Do it
`

const BLUEPRINT_IN_PROGRESS = `---
type: blueprint
status: in-progress
complexity: M
owner: bob
created: '2026-02-01'
last_updated: '2026-04-10'
tags: []
depends_on: []
---

# Active Feature

In-progress blueprint for next-ready-task testing.

#### Task 2.1: Write the code
**Status:** todo
- [ ] Write it
`

const TECH_DEBT = `---
type: tech-debt
status: needs-remediation
severity: high
category: testing
review_cadence: biweekly
last_reviewed: '2026-04-01'
created: '2026-02-10'
linked_blueprints: []
---

# Test debt item

Insufficient coverage.
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'ak-db-cmd-test-'))

  // blueprints
  mkdirSync(path.join(dir, 'blueprints', 'planned', 'my-planned-feature'), { recursive: true })
  mkdirSync(path.join(dir, 'blueprints', 'in-progress', 'active-feature'), { recursive: true })
  writeFileSync(
    path.join(dir, 'blueprints', 'planned', 'my-planned-feature', '_overview.md'),
    BLUEPRINT_PLANNED,
    'utf8',
  )
  writeFileSync(
    path.join(dir, 'blueprints', 'in-progress', 'active-feature', '_overview.md'),
    BLUEPRINT_IN_PROGRESS,
    'utf8',
  )

  // tech-debt
  mkdirSync(path.join(dir, 'tech-debt', 'needs-remediation'), { recursive: true })
  writeFileSync(
    path.join(dir, 'tech-debt', 'needs-remediation', 'h-001-test.md'),
    TECH_DEBT,
    'utf8',
  )

  // Minimal package.json so resolveBlueprintRoot picks the generic layout
  writeFileSync(path.join(dir, 'package.json'), '{"name":"test-consumer"}', 'utf8')

  return dir
}

let tmpRepoDir: string

beforeEach(() => {
  tmpRepoDir = makeTempRepo()
})

afterEach(() => {
  rmSync(tmpRepoDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// dbBuild
// ---------------------------------------------------------------------------

describe('dbBuild', () => {
  it('creates the DB and populates blueprints from fixture data', async () => {
    const result = await dbBuild(tmpRepoDir)

    expect(result.blueprintsCount).toBe(2)
    expect(result.techDebtCount).toBe(1)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(existsSync(result.dbPath)).toBe(true)
  })

  it('returns the correct dbPath inside .agent/', async () => {
    const result = await dbBuild(tmpRepoDir)
    expect(result.dbPath).toBe(path.join(tmpRepoDir, '.agent', '.blueprints.db'))
  })

  it('can be called twice without deleting the DB (idempotent upsert)', async () => {
    await dbBuild(tmpRepoDir)
    const result2 = await dbBuild(tmpRepoDir)

    expect(result2.blueprintsCount).toBeGreaterThanOrEqual(0)
    expect(existsSync(result2.dbPath)).toBe(true)
  })

  it('builds an in-progress blueprint with queryable tasks', async () => {
    const result = await dbBuild(tmpRepoDir)
    const conn = openDb(result.dbPath)
    try {
      const tasks = conn.db
        .prepare('SELECT task_id, blueprint_slug FROM tasks WHERE blueprint_slug = ?')
        .all('active-feature') as Array<{ task_id: string; blueprint_slug: string }>
      expect(tasks.length).toBeGreaterThanOrEqual(1)
    } finally {
      conn.close()
    }
  })
})

// ---------------------------------------------------------------------------
// dbVerify
// ---------------------------------------------------------------------------

describe('dbVerify', () => {
  it('reports OK when DB matches files', async () => {
    await dbBuild(tmpRepoDir)
    const result = await dbVerify(tmpRepoDir)

    expect(result.ok).toBe(true)
    expect(result.staleEntries).toHaveLength(0)
    expect(result.blueprintsCount).toBe(2)
    expect(result.techDebtCount).toBe(1)
  })

  it('throws when DB does not exist', async () => {
    await expect(dbVerify(tmpRepoDir)).rejects.toThrow('Run `ak blueprint db build` first')
  })

  it('reports stale entry when blueprint content changes after build', async () => {
    await dbBuild(tmpRepoDir)

    // Mutate the file on disk after the DB was built
    const overviewPath = path.join(
      tmpRepoDir,
      'blueprints',
      'planned',
      'my-planned-feature',
      '_overview.md',
    )
    writeFileSync(overviewPath, BLUEPRINT_PLANNED + '\n<!-- mutated -->\n', 'utf8')

    const result = await dbVerify(tmpRepoDir)

    expect(result.ok).toBe(false)
    const stale = result.staleEntries.find((e) => e.slug === 'my-planned-feature')
    expect(stale).toBeDefined()
    expect(stale?.table).toBe('blueprints')
  })

  it('reports stale entry when a tech-debt file changes after build', async () => {
    await dbBuild(tmpRepoDir)

    const tdPath = path.join(
      tmpRepoDir,
      'tech-debt',
      'needs-remediation',
      'h-001-test.md',
    )
    writeFileSync(tdPath, TECH_DEBT + '\n<!-- mutated -->\n', 'utf8')

    const result = await dbVerify(tmpRepoDir)

    expect(result.ok).toBe(false)
    const stale = result.staleEntries.find((e) => e.slug === 'h-001-test')
    expect(stale).toBeDefined()
    expect(stale?.table).toBe('tech_debt_items')
  })
})

// ---------------------------------------------------------------------------
// dbQuery
// ---------------------------------------------------------------------------

describe('dbQuery', () => {
  it('returns rows from next-ready-task for in-progress blueprints', async () => {
    await dbBuild(tmpRepoDir)
    const result = await dbQuery(tmpRepoDir, 'next-ready-task', { limit: 3 })

    expect(result.templateId).toBe('next-ready-task')
    // active-feature is in-progress with a todo task — should appear
    expect(result.rows.length).toBeGreaterThanOrEqual(1)
    const row = result.rows[0] as Record<string, unknown>
    expect(row['blueprint_slug']).toBe('active-feature')
  })

  it('respects the limit param', async () => {
    await dbBuild(tmpRepoDir)
    const result = await dbQuery(tmpRepoDir, 'next-ready-task', { limit: 1 })

    expect(result.rows.length).toBeLessThanOrEqual(1)
  })

  it('throws on unknown template id', async () => {
    await dbBuild(tmpRepoDir)
    await expect(dbQuery(tmpRepoDir, 'no-such-template', {})).rejects.toThrow(
      'Unknown template id',
    )
  })
})

// ---------------------------------------------------------------------------
// dbBrowse — use injectable execSync to avoid spawning real processes
// ---------------------------------------------------------------------------

describe('dbBrowse', () => {
  it('prints "Install Datasette" message and exits 1 when datasette not found', async () => {
    await dbBuild(tmpRepoDir)

    const stderr: string[] = []
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr.push(String(chunk))
      return true
    })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => {
      throw new Error('process.exit called')
    })

    // Inject a fake execSync that throws on datasette --version
    const fakeExecSync = (cmd: string): Buffer => {
      if (String(cmd).startsWith('datasette')) {
        throw new Error('command not found: datasette')
      }
      return Buffer.from('')
    }

    try {
      expect(() => dbBrowse(tmpRepoDir, fakeExecSync as typeof import('node:child_process').execSync)).toThrow('process.exit called')
      expect(stderr.join('')).toContain('pip install datasette')
    } finally {
      stderrSpy.mockRestore()
      exitSpy.mockRestore()
    }
  })

  it('prints "Run ak blueprint db build first" and exits 1 when DB missing', () => {
    const stderr: string[] = []
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr.push(String(chunk))
      return true
    })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => {
      throw new Error('process.exit called')
    })

    const fakeExecSync = (_cmd: string): Buffer => Buffer.from('')

    try {
      expect(() => dbBrowse(tmpRepoDir, fakeExecSync as typeof import('node:child_process').execSync)).toThrow('process.exit called')
      expect(stderr.join('')).toContain('ak blueprint db build')
    } finally {
      stderrSpy.mockRestore()
      exitSpy.mockRestore()
    }
  })
})

// ---------------------------------------------------------------------------
// executeBlueprintDbSubcommand (dispatch)
// ---------------------------------------------------------------------------

describe('executeBlueprintDbSubcommand', () => {
  it('build verb populates the DB and prints a human-readable line', async () => {
    const output: string[] = []
    const print = (value: object | string): void => {
      output.push(typeof value === 'string' ? value : JSON.stringify(value))
    }

    await executeBlueprintDbSubcommand('build', [], { projectRoot: tmpRepoDir }, print)

    expect(output[0]).toMatch(/Rebuilt in \d+ms \(\d+ blueprints, \d+ tech-debt items\)/)
  })

  it('build verb with --json prints a JSON object', async () => {
    const output: (object | string)[] = []
    const print = (value: object | string): void => {
      output.push(value)
    }

    await executeBlueprintDbSubcommand('build', [], { projectRoot: tmpRepoDir, json: true }, print)

    const result = output[0] as Record<string, unknown>
    expect(typeof result).toBe('object')
    expect(result['blueprintsCount']).toBeTypeOf('number')
  })

  it('verify verb reports OK when DB matches', async () => {
    await dbBuild(tmpRepoDir)

    const output: string[] = []
    const print = (value: object | string): void => {
      output.push(typeof value === 'string' ? value : JSON.stringify(value))
    }

    await executeBlueprintDbSubcommand('verify', [], { projectRoot: tmpRepoDir }, print)
    expect(output[0]).toMatch(/^OK \(/)
  })

  it('query verb requires a template-id argument', async () => {
    await dbBuild(tmpRepoDir)
    await expect(
      executeBlueprintDbSubcommand('query', [], { projectRoot: tmpRepoDir }, () => {}),
    ).rejects.toThrow('Usage: ak blueprint db query <template-id>')
  })

  it('query verb rejects invalid --params JSON', async () => {
    await dbBuild(tmpRepoDir)
    await expect(
      executeBlueprintDbSubcommand(
        'query',
        ['next-ready-task'],
        { projectRoot: tmpRepoDir, params: 'not-json' },
        () => {},
      ),
    ).rejects.toThrow('Invalid --params JSON')
  })

  it('unknown verb throws with list of valid verbs', async () => {
    await expect(
      executeBlueprintDbSubcommand('bogus', [], { projectRoot: tmpRepoDir }, () => {}),
    ).rejects.toThrow('Unknown blueprint db verb: bogus')
  })

  it('undefined verb throws with list of valid verbs', async () => {
    await expect(
      executeBlueprintDbSubcommand(undefined, [], { projectRoot: tmpRepoDir }, () => {}),
    ).rejects.toThrow('Unknown blueprint db verb')
  })
})
