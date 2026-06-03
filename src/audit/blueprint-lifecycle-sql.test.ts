import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { auditBlueprintLifecycleSql } from './blueprint-lifecycle-sql.js'

// ---------------------------------------------------------------------------
// Helpers
//
// The audit builds an EPHEMERAL in-memory projection from the repo's blueprint
// MARKDOWN (no persistent DB is read), so fixtures are markdown files under
// `blueprints/<status>/...`, not injected DB rows. A `package.json` anchors
// `resolveBlueprintRoot` to the temp dir.
// ---------------------------------------------------------------------------

function makeTempRepo(): string {
  const cwd = mkdtempSync(path.join(tmpdir(), 'wp-audit-bp-lifecycle-'))
  writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'tmp-repo' }))
  mkdirSync(path.join(cwd, 'blueprints'), { recursive: true })
  return cwd
}

interface BlueprintFixture {
  status: string
  /** Frontmatter `status:` value; defaults to the directory `status`. */
  frontmatterStatus?: string
  /** Task blocks: each becomes a `#### Task X.Y` with the given **Status:**. */
  tasks?: ReadonlyArray<{ id: string; status: string }>
}

/** Write a flat blueprint markdown file at `blueprints/<status>/<slug>.md`. */
function writeBlueprint(cwd: string, slug: string, fx: BlueprintFixture): void {
  const dir = path.join(cwd, 'blueprints', fx.status)
  mkdirSync(dir, { recursive: true })
  const fm = [
    '---',
    'type: blueprint',
    `title: Blueprint ${slug}`,
    'owner: tester',
    `status: ${fx.frontmatterStatus ?? fx.status}`,
    'complexity: S',
    'created: "2026-06-03"',
    'last_updated: "2026-06-03"',
    '---',
    '',
    `# Blueprint ${slug}`,
    '',
  ]
  const body: string[] = []
  for (const task of fx.tasks ?? []) {
    body.push(
      `#### Task ${task.id}: Step ${task.id}`,
      '',
      `**Status:** ${task.status}`,
      '',
      '**Acceptance:**',
      '',
      '- [ ] done',
      '',
    )
  }
  writeFileSync(path.join(dir, `${slug}.md`), [...fm, ...body].join('\n'))
}

let cwd: string

beforeEach(() => {
  cwd = makeTempRepo()
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

describe('auditBlueprintLifecycleSql — deterministic (markdown → ephemeral projection)', () => {
  it('returns ok when there are no blueprints', async () => {
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(true)
    expect(result.title).toBe('Blueprint lifecycle')
    expect(result.violations).toHaveLength(0)
  })

  it('reads no persistent DB — verdict comes purely from the markdown', async () => {
    writeBlueprint(cwd, 'active-wip', {
      status: 'in-progress',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('catches an in-progress blueprint with 0 tasks', async () => {
    writeBlueprint(cwd, 'empty-wip', { status: 'in-progress' })
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) => v.message.includes('empty-wip') && /0 tasks|no tasks/i.test(v.message),
      ),
    ).toBe(true)
  })

  it('catches a status/directory mismatch (file in completed/ but status=in-progress)', async () => {
    writeBlueprint(cwd, 'mismatched', {
      status: 'completed',
      frontmatterStatus: 'in-progress',
      tasks: [{ id: '1.1', status: 'done' }],
    })
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) => v.message.includes('mismatched') && /status|directory|completed|in-progress/i.test(v.message),
      ),
    ).toBe(true)
  })

  it('catches a completed blueprint whose tasks are not all done (progress_pct < 100)', async () => {
    writeBlueprint(cwd, 'partial-done', {
      status: 'completed',
      tasks: [
        { id: '1.1', status: 'done' },
        { id: '1.2', status: 'todo' },
      ],
    })
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) => v.message.includes('partial-done') && /progress_pct|completed/i.test(v.message),
      ),
    ).toBe(true)
  })

  it('passes a completed blueprint whose tasks are all done', async () => {
    writeBlueprint(cwd, 'fully-done', {
      status: 'completed',
      tasks: [{ id: '1.1', status: 'done' }],
    })
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.violations.some((v) => v.message.includes('fully-done'))).toBe(false)
  })
})
