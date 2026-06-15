import { execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

function initGitRepo(cwd: string): void {
  execSync('git init -q', { cwd })
  execSync('git config user.email test@test.local', { cwd })
  execSync('git config user.name test', { cwd })
}

function commitAll(cwd: string, isoDate: string): void {
  execSync('git add .', { cwd })
  execSync('git commit -q -m test-commit', {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: isoDate,
      GIT_COMMITTER_DATE: isoDate,
    },
  })
}

function transitionBlueprint(
  cwd: string,
  slug: string,
  from: string,
  to: string,
  nextFrontmatterStatus: string = to,
): void {
  const fromPath = path.join(cwd, 'blueprints', from, `${slug}.md`)
  const toDir = path.join(cwd, 'blueprints', to)
  const toPath = path.join(toDir, `${slug}.md`)
  mkdirSync(toDir, { recursive: true })
  const nextMarkdown = readFileSync(fromPath, 'utf8').replace(
    new RegExp(`^status:\\s*${from}$`, 'm'),
    `status: ${nextFrontmatterStatus}`,
  )
  execSync(`git mv "${fromPath}" "${toPath}"`, { cwd })
  writeFileSync(toPath, nextMarkdown, 'utf8')
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
        (v) =>
          v.message.includes('mismatched') &&
          /status|directory|completed|in-progress/i.test(v.message),
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

  it('does not flag a completed blueprint whose remaining non-done task is intentionally dropped', async () => {
    writeBlueprint(cwd, 'descoped-complete', {
      status: 'completed',
      tasks: [
        { id: '1.1', status: 'done' },
        { id: '1.2', status: 'dropped' },
      ],
    })
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.violations.some((v) => v.message.includes('descoped-complete'))).toBe(false)
  })

  it('catches an in-progress blueprint whose tasks are all done (finished, wrong lane)', async () => {
    writeBlueprint(cwd, 'shipped-but-wip', {
      status: 'in-progress',
      tasks: [
        { id: '1.1', status: 'done' },
        { id: '1.2', status: 'done' },
      ],
    })
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) =>
          v.message.includes('shipped-but-wip') && /done\/dropped|in-progress/i.test(v.message),
      ),
    ).toBe(true)
  })

  it('treats a dropped task as terminal (done ∪ dropped) for the wrong-lane check', async () => {
    writeBlueprint(cwd, 'descoped-wip', {
      status: 'in-progress',
      tasks: [
        { id: '1.1', status: 'done' },
        { id: '1.2', status: 'dropped' },
      ],
    })
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.violations.some((v) => v.message.includes('descoped-wip'))).toBe(true)
  })

  it('catches a completed blueprint with a non-terminal task (untruthful status)', async () => {
    writeBlueprint(cwd, 'claims-done', {
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
        (v) => v.message.includes('claims-done') && /not done\/dropped|completed/i.test(v.message),
      ),
    ).toBe(true)
  })

  it('catches exceeding the in-progress WIP limit', async () => {
    for (const slug of ['wip-a', 'wip-b', 'wip-c', 'wip-d']) {
      writeBlueprint(cwd, slug, { status: 'in-progress', tasks: [{ id: '1.1', status: 'todo' }] })
    }
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) =>
          /in-progress.*lane limit|lane limit/i.test(v.message) &&
          v.message.includes('blueprint-wip-in-progress-max'),
      ),
    ).toBe(true)
  })

  it('allows up to the WIP limit', async () => {
    for (const slug of ['wip-1', 'wip-2', 'wip-3']) {
      writeBlueprint(cwd, slug, { status: 'in-progress', tasks: [{ id: '1.1', status: 'todo' }] })
    }
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.violations.some((v) => /lane limit/i.test(v.message))).toBe(false)
  })

  it('respects the WIP budget override from .agent/.audit-budgets.yaml', async () => {
    mkdirSync(path.join(cwd, '.agent'), { recursive: true })
    writeFileSync(
      path.join(cwd, '.agent', '.audit-budgets.yaml'),
      ['budgets:', '  blueprint-wip-in-progress-max:', '    max: 2', ''].join('\n'),
      'utf8',
    )
    for (const slug of ['wip-1', 'wip-2', 'wip-3']) {
      writeBlueprint(cwd, slug, { status: 'in-progress', tasks: [{ id: '1.1', status: 'todo' }] })
    }
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => /lane limit is 2/i.test(v.message))).toBe(true)
  })

  it('warns when an in-progress blueprint is stale in git history', async () => {
    initGitRepo(cwd)
    writeBlueprint(cwd, 'stale-blueprint', {
      status: 'in-progress',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    commitAll(cwd, '2026-05-01T12:00:00Z')

    mkdirSync(path.join(cwd, '.agent'), { recursive: true })
    writeFileSync(
      path.join(cwd, '.agent', '.audit-budgets.yaml'),
      ['budgets:', '  blueprint-stale-in-progress-days:', '    max_days: 1', ''].join('\n'),
      'utf8',
    )

    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(true)
    expect(
      result.violations.some(
        (v) => v.message.startsWith('[warn]') && /stale-blueprint/.test(v.message),
      ),
    ).toBe(true)
  })

  it('passes without a staleness warning when an in-progress blueprint is fresh in git history', async () => {
    initGitRepo(cwd)
    writeBlueprint(cwd, 'fresh-blueprint', {
      status: 'in-progress',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    commitAll(cwd, '2030-01-01T12:00:00Z')

    mkdirSync(path.join(cwd, '.agent'), { recursive: true })
    writeFileSync(
      path.join(cwd, '.agent', '.audit-budgets.yaml'),
      ['budgets:', '  blueprint-stale-in-progress-days:', '    max_days: 14', ''].join('\n'),
      'utf8',
    )

    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(true)
    expect(result.violations.some((v) => v.message.startsWith('[warn]'))).toBe(false)
  })

  it('never applies staleness warnings to non in-progress blueprint states', async () => {
    initGitRepo(cwd)
    writeBlueprint(cwd, 'completed-blueprint', {
      status: 'completed',
      tasks: [{ id: '1.1', status: 'done' }],
    })
    writeBlueprint(cwd, 'parked-blueprint', {
      status: 'parked',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    commitAll(cwd, '2026-05-01T12:00:00Z')

    mkdirSync(path.join(cwd, '.agent'), { recursive: true })
    writeFileSync(
      path.join(cwd, '.agent', '.audit-budgets.yaml'),
      ['budgets:', '  blueprint-stale-in-progress-days:', '    max_days: 1', ''].join('\n'),
      'utf8',
    )

    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(true)
    expect(result.violations.some((v) => /stale/i.test(v.message))).toBe(false)
  })

  it('degrades gracefully outside git by surfacing a non-failing staleness notice in the title', async () => {
    writeBlueprint(cwd, 'nogit-blueprint', {
      status: 'in-progress',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(true)
    expect(result.title).toContain('staleness check skipped outside git')
    expect(result.violations.some((v) => v.message.startsWith('[warn]'))).toBe(false)
  })

  it('flags an illegal lifecycle transition based on git history', async () => {
    initGitRepo(cwd)
    writeBlueprint(cwd, 'jumped-the-queue', {
      status: 'draft',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    commitAll(cwd, '2030-01-01T12:00:00Z')

    transitionBlueprint(cwd, 'jumped-the-queue', 'draft', 'completed')
    commitAll(cwd, '2030-01-02T12:00:00Z')

    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) =>
          v.message.includes('jumped-the-queue') &&
          /illegal/i.test(v.message) &&
          /planned, archived/i.test(v.message),
      ),
    ).toBe(true)
  })

  it('allows a legal lifecycle transition based on git history', async () => {
    initGitRepo(cwd)
    writeBlueprint(cwd, 'ready-to-start', {
      status: 'planned',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    commitAll(cwd, '2030-01-01T12:00:00Z')

    transitionBlueprint(cwd, 'ready-to-start', 'planned', 'in-progress')
    commitAll(cwd, '2030-01-02T12:00:00Z')

    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.violations.some((v) => v.message.includes('ready-to-start'))).toBe(false)
  })

  it('allows planned blueprints to complete directly when all tasks are terminal', async () => {
    initGitRepo(cwd)
    writeBlueprint(cwd, 'one-pr-finish', {
      status: 'planned',
      tasks: [
        { id: '1.1', status: 'done' },
        { id: '1.2', status: 'dropped' },
      ],
    })
    commitAll(cwd, '2030-01-01T12:00:00Z')

    transitionBlueprint(cwd, 'one-pr-finish', 'planned', 'completed')
    commitAll(cwd, '2030-01-02T12:00:00Z')

    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(true)
    expect(result.violations.some((v) => v.message.includes('one-pr-finish'))).toBe(false)
  })

  it('grandfathers historical transition gaps when the current blueprint declares the existing waiver', async () => {
    initGitRepo(cwd)
    writeBlueprint(cwd, 'legacy-gap', {
      status: 'draft',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    commitAll(cwd, '2030-01-01T12:00:00Z')

    transitionBlueprint(cwd, 'legacy-gap', 'draft', 'completed')
    const completedPath = path.join(cwd, 'blueprints', 'completed', 'legacy-gap.md')
    const waivedMarkdown = readFileSync(completedPath, 'utf8').replace(
      'status: completed',
      ['status: completed', 'historical_verification_gap_waiver: true'].join('\n'),
    )
    writeFileSync(completedPath, waivedMarkdown, 'utf8')
    commitAll(cwd, '2030-01-02T12:00:00Z')

    const result = await auditBlueprintLifecycleSql(cwd)
    expect(
      result.violations.some((v) => v.message.includes('legacy-gap') && /illegal/i.test(v.message)),
    ).toBe(false)
  })
})
