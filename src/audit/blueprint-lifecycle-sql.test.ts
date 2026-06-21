import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
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

interface FakeGitOptions {
  readonly lastTouchIso?: string
  readonly previousStatusByPath?: Record<string, string>
  readonly patchByPath?: Record<string, string>
}

async function withFakeGitHistory<T>(options: FakeGitOptions, run: () => Promise<T>): Promise<T> {
  const fakeRoot = mkdtempSync(path.join(tmpdir(), 'wp-audit-bp-fake-git-'))
  const gitPath = path.join(fakeRoot, 'git')
  const patchCases = Object.entries(options.patchByPath ?? {})
    .map(([expectedPath, patch], index) => {
      const patchFile = path.join(fakeRoot, `patch-${index}.diff`)
      writeFileSync(patchFile, patch, 'utf8')
      return `    *${expectedPath}) cat ${JSON.stringify(patchFile)}; exit 0 ;;`
    })
    .join('\n')
  const previousStatusCases = Object.entries(options.previousStatusByPath ?? {})
    .map(
      ([expectedPath, previousStatus]) => `    *${expectedPath})
      current_status=$(awk '/^status:/ { sub(/^status:[[:space:]]*/, ""); print; exit }' "$PWD/$filePath")
      [ -z "$current_status" ] && exit 0
      printf '%s\\n' 'commit:fake-head' '@@ -1 +1 @@' '-status: ${previousStatus}' "+status: $current_status" 'commit:fake-base'
      exit 0
      ;;`,
    )
    .join('\n')

  writeFileSync(
    gitPath,
    `#!/bin/sh
if [ "$1" = "rev-parse" ] && [ "$2" = "--show-toplevel" ]; then
  pwd
  exit 0
fi

if [ "$1" = "log" ]; then
  has_one=false
  has_iso_format=false
  has_patch=false
  for arg do
    [ "$arg" = "-1" ] && has_one=true
    [ "$arg" = "--format=%cI" ] && has_iso_format=true
    [ "$arg" = "-p" ] && has_patch=true
  done
  if [ "$has_one" = "true" ] && [ "$has_iso_format" = "true" ]; then
    printf '%s\\n' "\${WP_FAKE_GIT_LAST_TOUCH_ISO:-2030-01-01T12:00:00+00:00}"
    exit 0
  fi
  if [ "$has_patch" = "true" ]; then
    for lastArg do
      filePath=$lastArg
    done
    filePath=$(printf '%s' "$filePath" | sed 's#\\\\#/#g')
    case "$filePath" in
${patchCases}
${previousStatusCases}
    esac
    exit 0
  fi
fi

printf '%s\\n' "unexpected fake git invocation: $*" >&2
exit 1
`,
    'utf8',
  )
  chmodSync(gitPath, 0o755)

  const previousPath = process.env.PATH
  const previousTouch = process.env.WP_FAKE_GIT_LAST_TOUCH_ISO
  process.env.PATH = `${fakeRoot}${path.delimiter}${previousPath ?? ''}`
  process.env.WP_FAKE_GIT_LAST_TOUCH_ISO = options.lastTouchIso ?? '2030-01-01T12:00:00+00:00'

  try {
    expect(
      realpathSync(
        execFileSync('git', ['rev-parse', '--show-toplevel'], {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim(),
      ),
    ).toBe(realpathSync(cwd))
    expect(
      execFileSync('git', ['log', '-1', '--format=%cI', '--', 'blueprints/example.md'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    ).toBe(options.lastTouchIso ?? '2030-01-01T12:00:00+00:00')
    const [firstHistoryPath, firstPreviousStatus] = Object.entries(
      options.previousStatusByPath ?? {},
    )[0] ?? [null, null]
    if (firstHistoryPath && firstPreviousStatus) {
      const fakePatch = execFileSync(
        'git',
        ['log', '--follow', '--find-renames', '--format=commit:%H', '--unified=0', '-p', '--', firstHistoryPath],
        { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      )
      expect(fakePatch).toContain(`-status: ${firstPreviousStatus}`)
    }
    const [firstPatchPath, firstPatch] = Object.entries(options.patchByPath ?? {})[0] ?? [null, null]
    if (firstPatchPath && firstPatch) {
      const fakePatch = execFileSync(
        'git',
        ['log', '--follow', '--find-renames', '--format=commit:%H', '--unified=0', '-p', '--', firstPatchPath],
        { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      )
      expect(fakePatch).toContain(firstPatch)
    }
    return await run()
  } finally {
    if (previousPath === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = previousPath
    }
    if (previousTouch === undefined) {
      delete process.env.WP_FAKE_GIT_LAST_TOUCH_ISO
    } else {
      process.env.WP_FAKE_GIT_LAST_TOUCH_ISO = previousTouch
    }
    rmSync(fakeRoot, { recursive: true, force: true })
  }
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

describe.sequential('auditBlueprintLifecycleSql — deterministic (markdown → ephemeral projection)', () => {
  it.sequential('returns ok when there are no blueprints', async () => {
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(true)
    expect(result.title).toBe('Blueprint lifecycle')
    expect(result.violations).toHaveLength(0)
  })

  it.sequential('reads no persistent DB — verdict comes purely from the markdown', async () => {
    writeBlueprint(cwd, 'active-wip', {
      status: 'in-progress',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it.sequential('catches an in-progress blueprint with 0 tasks', async () => {
    writeBlueprint(cwd, 'empty-wip', { status: 'in-progress' })
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) => v.message.includes('empty-wip') && /0 tasks|no tasks/i.test(v.message),
      ),
    ).toBe(true)
  })

  it.sequential('catches a status/directory mismatch (file in completed/ but status=in-progress)', async () => {
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

  it.sequential('catches a completed blueprint whose tasks are not all done (progress_pct < 100)', async () => {
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

  it.sequential('passes a completed blueprint whose tasks are all done', async () => {
    writeBlueprint(cwd, 'fully-done', {
      status: 'completed',
      tasks: [{ id: '1.1', status: 'done' }],
    })
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.violations.some((v) => v.message.includes('fully-done'))).toBe(false)
  })

  it.sequential('does not flag a completed blueprint whose remaining non-done task is intentionally dropped', async () => {
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

  it.sequential('catches an in-progress blueprint whose tasks are all done (finished, wrong lane)', async () => {
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

  it.sequential('treats a dropped task as terminal (done ∪ dropped) for the wrong-lane check', async () => {
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

  it.sequential('catches a completed blueprint with a non-terminal task (untruthful status)', async () => {
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

  it.sequential('catches exceeding the in-progress WIP limit', async () => {
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

  it.sequential('allows up to the WIP limit', async () => {
    for (const slug of ['wip-1', 'wip-2', 'wip-3']) {
      writeBlueprint(cwd, slug, { status: 'in-progress', tasks: [{ id: '1.1', status: 'todo' }] })
    }
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.violations.some((v) => /lane limit/i.test(v.message))).toBe(false)
  })

  it.sequential('respects the WIP budget override from .agent/.audit-budgets.yaml', async () => {
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

  it.sequential('warns when an in-progress blueprint is stale in git history', async () => {
    writeBlueprint(cwd, 'stale-blueprint', {
      status: 'in-progress',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    mkdirSync(path.join(cwd, '.agent'), { recursive: true })
    writeFileSync(
      path.join(cwd, '.agent', '.audit-budgets.yaml'),
      ['budgets:', '  blueprint-stale-in-progress-days:', '    max_days: 1', ''].join('\n'),
      'utf8',
    )

    const result = await withFakeGitHistory(
      { lastTouchIso: '2026-05-01T12:00:00+00:00' },
      () => auditBlueprintLifecycleSql(cwd),
    )
    expect(result.ok).toBe(true)
    expect(
      result.violations.some(
        (v) => v.message.startsWith('[warn]') && /stale-blueprint/.test(v.message),
      ),
    ).toBe(true)
  })

  it.sequential('passes without a staleness warning when an in-progress blueprint is fresh in git history', async () => {
    writeBlueprint(cwd, 'fresh-blueprint', {
      status: 'in-progress',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    mkdirSync(path.join(cwd, '.agent'), { recursive: true })
    writeFileSync(
      path.join(cwd, '.agent', '.audit-budgets.yaml'),
      ['budgets:', '  blueprint-stale-in-progress-days:', '    max_days: 14', ''].join('\n'),
      'utf8',
    )

    const result = await withFakeGitHistory(
      { lastTouchIso: '2030-01-01T12:00:00+00:00' },
      () => auditBlueprintLifecycleSql(cwd),
    )
    expect(result.ok).toBe(true)
    expect(result.violations.some((v) => v.message.startsWith('[warn]'))).toBe(false)
  })

  it.sequential('never applies staleness warnings to non in-progress blueprint states', async () => {
    writeBlueprint(cwd, 'completed-blueprint', {
      status: 'completed',
      tasks: [{ id: '1.1', status: 'done' }],
    })
    writeBlueprint(cwd, 'parked-blueprint', {
      status: 'parked',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    mkdirSync(path.join(cwd, '.agent'), { recursive: true })
    writeFileSync(
      path.join(cwd, '.agent', '.audit-budgets.yaml'),
      ['budgets:', '  blueprint-stale-in-progress-days:', '    max_days: 1', ''].join('\n'),
      'utf8',
    )

    const result = await withFakeGitHistory(
      { lastTouchIso: '2026-05-01T12:00:00+00:00' },
      () => auditBlueprintLifecycleSql(cwd),
    )
    expect(result.ok).toBe(true)
    expect(result.violations.some((v) => /stale/i.test(v.message))).toBe(false)
  })

  it.sequential('degrades gracefully outside git by surfacing a non-failing staleness notice in the title', async () => {
    writeBlueprint(cwd, 'nogit-blueprint', {
      status: 'in-progress',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(true)
    expect(result.title).toContain('staleness check skipped outside git')
    expect(result.violations.some((v) => v.message.startsWith('[warn]'))).toBe(false)
  })


  it.sequential('degrades transition history checks instead of timing out when the git history budget is exhausted', async () => {
    writeBlueprint(cwd, 'budget-a', {
      status: 'planned',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    writeBlueprint(cwd, 'budget-b', {
      status: 'planned',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    const result = await withFakeGitHistory({}, () =>
      auditBlueprintLifecycleSql(cwd, { transitionHistoryBudgetMs: 0 }),
    )

    expect(result.ok).toBe(true)
    expect(result.title).toContain('transition history check partially skipped by time budget')
    expect(
      result.violations.some(
        (v) =>
          v.message.startsWith('[warn]') &&
          v.message.includes('transition history check stopped after 0/2 files'),
      ),
    ).toBe(true)
  })

  it.sequential('flags an illegal lifecycle transition based on git history', async () => {
    writeBlueprint(cwd, 'jumped-the-queue', {
      status: 'in-progress',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    const result = await withFakeGitHistory(
      { previousStatusByPath: { 'blueprints/in-progress/jumped-the-queue.md': 'draft' } },
      () => auditBlueprintLifecycleSql(cwd),
    )
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) =>
          v.message.includes('jumped-the-queue') &&
          /illegal/i.test(v.message) &&
          /planned, completed, archived/i.test(v.message),
      ),
    ).toBe(true)
  })

  it.sequential('allows a legal lifecycle transition based on git history', async () => {
    writeBlueprint(cwd, 'ready-to-start', {
      status: 'in-progress',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    const result = await withFakeGitHistory(
      { previousStatusByPath: { 'blueprints/in-progress/ready-to-start.md': 'planned' } },
      () => auditBlueprintLifecycleSql(cwd),
    )
    expect(result.violations.some((v) => v.message.includes('ready-to-start'))).toBe(false)
  })

  it.sequential('ignores body status-looking patch lines when checking lifecycle transitions', async () => {
    writeBlueprint(cwd, 'body-status-example', {
      status: 'in-progress',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    const blueprintPath = path.join(cwd, 'blueprints', 'in-progress', 'body-status-example.md')
    writeFileSync(
      blueprintPath,
      [
        readFileSync(blueprintPath, 'utf8'),
        '',
        '```yaml',
        'status: in-progress',
        '```',
        '',
      ].join('\n'),
      'utf8',
    )

    const result = await withFakeGitHistory(
      {
        patchByPath: {
          'blueprints/in-progress/body-status-example.md': [
            'commit:fake-body-edit',
            '@@ -20 +20 @@',
            '-status: archived',
            '+status: in-progress',
            'commit:fake-base',
          ].join('\n'),
        },
      },
      () => auditBlueprintLifecycleSql(cwd),
    )

    expect(result.ok).toBe(true)
    expect(result.violations.some((v) => v.message.includes('body-status-example'))).toBe(false)
  })

  it.sequential('allows planned blueprints to complete directly when all tasks are terminal', async () => {
    writeBlueprint(cwd, 'one-pr-finish', {
      status: 'completed',
      tasks: [
        { id: '1.1', status: 'done' },
        { id: '1.2', status: 'dropped' },
      ],
    })
    const result = await withFakeGitHistory(
      { previousStatusByPath: { 'blueprints/completed/one-pr-finish.md': 'planned' } },
      () => auditBlueprintLifecycleSql(cwd),
    )
    expect(result.ok).toBe(true)
    expect(result.violations.some((v) => v.message.includes('one-pr-finish'))).toBe(false)
  })

  it.sequential('allows draft blueprints to complete directly when all tasks are terminal', async () => {
    writeBlueprint(cwd, 'draft-one-pr-finish', {
      status: 'completed',
      tasks: [
        { id: '1.1', status: 'done' },
        { id: '1.2', status: 'dropped' },
      ],
    })
    const result = await withFakeGitHistory(
      { previousStatusByPath: { 'blueprints/completed/draft-one-pr-finish.md': 'draft' } },
      () => auditBlueprintLifecycleSql(cwd),
    )
    expect(result.ok).toBe(true)
    expect(result.violations.some((v) => v.message.includes('draft-one-pr-finish'))).toBe(false)
  })

  it.sequential('rejects direct draft-to-completed when tasks are still open', async () => {
    writeBlueprint(cwd, 'draft-one-pr-open-work', {
      status: 'completed',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    const result = await withFakeGitHistory(
      { previousStatusByPath: { 'blueprints/completed/draft-one-pr-open-work.md': 'draft' } },
      () => auditBlueprintLifecycleSql(cwd),
    )
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) =>
          v.message.includes('draft-one-pr-open-work') &&
          v.message.includes('not done/dropped'),
      ),
    ).toBe(true)
  })

  it.sequential('rejects direct planned-to-completed when tasks are still open', async () => {
    writeBlueprint(cwd, 'one-pr-open-work', {
      status: 'completed',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    const result = await withFakeGitHistory(
      { previousStatusByPath: { 'blueprints/completed/one-pr-open-work.md': 'planned' } },
      () => auditBlueprintLifecycleSql(cwd),
    )
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) => v.message.includes('one-pr-open-work') && v.message.includes('not done/dropped'),
      ),
    ).toBe(true)
  })

  it.sequential('rejects direct planned-to-completed when the blueprint has zero tasks', async () => {
    writeBlueprint(cwd, 'one-pr-empty', { status: 'completed' })
    const result = await withFakeGitHistory(
      { previousStatusByPath: { 'blueprints/completed/one-pr-empty.md': 'planned' } },
      () => auditBlueprintLifecycleSql(cwd),
    )
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) => v.message.includes('one-pr-empty') && /zero-task|0 tasks|no tasks/i.test(v.message),
      ),
    ).toBe(true)
  })

  it.sequential('grandfathers historical transition gaps when the current blueprint declares the existing waiver', async () => {
    writeBlueprint(cwd, 'legacy-gap', {
      status: 'completed',
      tasks: [{ id: '1.1', status: 'todo' }],
    })
    const completedPath = path.join(cwd, 'blueprints', 'completed', 'legacy-gap.md')
    const waivedMarkdown = readFileSync(completedPath, 'utf8').replace(
      'status: completed',
      ['status: completed', 'historical_verification_gap_waiver: true'].join('\n'),
    )
    writeFileSync(completedPath, waivedMarkdown, 'utf8')
    const result = await withFakeGitHistory(
      { previousStatusByPath: { 'blueprints/completed/legacy-gap.md': 'draft' } },
      () => auditBlueprintLifecycleSql(cwd),
    )
    expect(
      result.violations.some((v) => v.message.includes('legacy-gap') && /illegal/i.test(v.message)),
    ).toBe(false)
  })
})
