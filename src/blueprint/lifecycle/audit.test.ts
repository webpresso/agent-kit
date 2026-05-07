import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { runBlueprintAudit } from '#lifecycle/audit'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function writeOverview(root: string, relativePathSegments: string[], body: string): void {
  const dir = path.join(root, 'webpresso', 'blueprints', ...relativePathSegments.slice(0, -1))
  const file = path.join(root, 'webpresso', 'blueprints', ...relativePathSegments)
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, body, 'utf-8')
}

describe('runBlueprintAudit — engine semantics', () => {
  it('errors when the same blueprint slug exists in multiple lifecycle folders', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-duplicate-slug-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['planned', 'duplicate-slug', '_overview.md'],
      `---
type: blueprint
status: planned
complexity: S
created: 2026-04-02
last_updated: 2026-04-02
---

# duplicate-slug

#### Task 1.1: Draft
**Status:** todo

**Depends:** None

- [ ] a
`,
    )

    writeOverview(
      projectRoot,
      ['completed', 'duplicate-slug', '_overview.md'],
      `---
type: blueprint
status: completed
complexity: S
created: 2026-04-02
last_updated: 2026-04-02
---

# duplicate-slug

#### Task 1.1: Done
**Status:** done

**Depends:** None

- [x] a
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (issue) =>
          issue.message.includes(
            'Blueprint slug "duplicate-slug" appears in multiple lifecycle locations',
          ) &&
          issue.message.includes('planned/duplicate-slug') &&
          issue.message.includes('completed/duplicate-slug'),
      ),
    ).toBe(true)
  })

  it('allows blocked tasks while blueprint status stays in-progress', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-blocked-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['in-progress', 'blocked-tasks-ok', '_overview.md'],
      `---
type: blueprint
status: in-progress
complexity: S
created: 2026-04-02
last_updated: 2026-04-02
---

# blocked-tasks-ok

#### Task 1.1: Hold
**Status:** blocked
**Blocked:** waiting on upstream

**Depends:** None

- [ ] a

#### Task 1.2: Done slice
**Status:** done

**Depends:** Task 1.1

- [x] b
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(true)
  })

  it('errors when a completed blueprint contains a blocked task', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-done-blocked-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['completed', 'bad-done', '_overview.md'],
      `---
type: blueprint
status: completed
complexity: S
created: 2026-04-02
last_updated: 2026-04-02
---

# bad-done

#### Task 1.1: Stuck
**Status:** blocked
**Blocked:** still blocked

**Depends:** None

- [ ] a
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (i) =>
          i.message.includes('completed') &&
          i.message.includes('1.1') &&
          i.message.includes('"blocked"'),
      ),
    ).toBe(true)
  })

  it('errors when a completed blueprint has a non-done task', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-todo-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['completed', 'bad-todo', '_overview.md'],
      `---
type: blueprint
status: completed
complexity: S
created: 2026-04-02
last_updated: 2026-04-02
---

# bad-todo

#### Task 1.1: Left todo
**Status:** todo

**Depends:** None

- [ ] a
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (i) =>
          i.message.includes('completed') &&
          i.message.includes('1.1') &&
          i.message.includes('todo'),
      ),
    ).toBe(true)
  })

  it('errors when execution metadata claims completion before blueprint truth is completed', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-exec-completed-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['in-progress', 'exec-complete-mismatch', '_overview.md'],
      `---
type: blueprint
status: in-progress
complexity: S
created: 2026-04-10
last_updated: 2026-04-10
execution_backend: omx-team
execution_id: team-a
execution_status: completed
execution_updated_at: 2026-04-10T11:00:00Z
---

# exec-complete-mismatch

#### Task 1.1: Not done yet
**Status:** todo

**Depends:** None

- [ ] a
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some((issue) =>
        issue.message.includes(
          'Blueprint execution is completed but blueprint status is not completed',
        ),
      ),
    ).toBe(true)
    expect(
      result.issues.some((issue) =>
        issue.message.includes('Blueprint execution is completed but tasks remain unfinished'),
      ),
    ).toBe(true)
  })

  it('errors when failed execution still leaves the blueprint looking completed', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-exec-failed-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['completed', 'exec-failed-mismatch', '_overview.md'],
      `---
type: blueprint
status: completed
complexity: S
created: 2026-04-10
last_updated: 2026-04-10
execution_backend: omx-team
execution_id: team-a
execution_status: failed
execution_updated_at: 2026-04-10T11:00:00Z
---

# exec-failed-mismatch

#### Task 1.1: Done on paper
**Status:** done

**Depends:** None

- [x] a
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some((issue) =>
        issue.message.includes('Blueprint execution is failed but blueprint is marked completed'),
      ),
    ).toBe(true)
    expect(
      result.issues.some((issue) =>
        issue.message.includes('failed or blocked runtime work must not appear completed'),
      ),
    ).toBe(true)
  })

  it('errors when completed execution is missing verification and artifact evidence', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-exec-evidence-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['completed', 'exec-evidence-mismatch', '_overview.md'],
      `---
type: blueprint
status: completed
complexity: S
created: 2026-04-10
last_updated: 2026-04-10
execution_backend: omx-team
execution_id: team-a
execution_status: completed
execution_updated_at: 2026-04-10T11:00:00Z
---

# exec-evidence-mismatch

#### Task 1.1: Done on paper
**Status:** done

**Depends:** None

- [x] a
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some((issue) => issue.message.includes('named verification output is missing')),
    ).toBe(true)
    expect(
      result.issues.some((issue) => issue.message.includes('artifact or log identity is missing')),
    ).toBe(true)
  })

  it('does not block staged files that only overlap planned blueprint filesTouched', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-planned-overlap-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['planned', 'future-cli-work', '_overview.md'],
      `---
type: blueprint
status: planned
complexity: M
created: 2026-05-04
last_updated: 2026-05-04
---

# future-cli-work

**Files:**
- \`packages/cli/cli-utils/src/wrangler-launch-descriptor.ts\`

#### Task 1.1: Plan
**Status:** todo

**Depends:** None

- [ ] a
`,
    )

    const result = await runBlueprintAudit({
      projectRoot,
      stagedFiles: ['packages/cli/cli-utils/src/wrangler-launch-descriptor.ts'],
      strict: true,
    })

    expect(result.ok).toBe(true)
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        level: 'warning',
        message: expect.stringContaining('planned blueprint filesTouched'),
      }),
    )
  })

  it('still blocks staged files that overlap in-progress blueprint filesTouched', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-in-progress-overlap-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['in-progress', 'active-cli-work', '_overview.md'],
      `---
type: blueprint
status: in-progress
complexity: M
created: 2026-05-04
last_updated: 2026-05-04
---

# active-cli-work

**Files:**
- \`packages/cli/cli-utils/src/wrangler-launch-descriptor.ts\`

#### Task 1.1: Active
**Status:** in_progress

**Depends:** None

- [ ] a
`,
    )

    const result = await runBlueprintAudit({
      projectRoot,
      stagedFiles: ['packages/cli/cli-utils/src/wrangler-launch-descriptor.ts'],
      strict: true,
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('in-progress blueprint filesTouched'),
      }),
    )
  })
})

describe('runBlueprintAudit — task state validation', () => {
  it('errors when task has blocked reason but status is not blocked', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-blocked-reason-mismatch-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['in-progress', 'blocked-reason-wrong', '_overview.md'],
      `---
type: blueprint
status: in-progress
complexity: S
created: 2026-04-02
last_updated: 2026-04-02
---

# blocked-reason-wrong

#### Task 1.1: Task with wrong status
**Status:** todo
**Blocked:** Should not have this reason

**Depends:** None

- [ ] a
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (i) =>
          i.message.includes('1.1') &&
          i.message.includes('blocked reason') &&
          i.message.includes('todo'),
      ),
    ).toBe(true)
  })

  it('errors when task is blocked but has no blocked reason', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-missing-blocked-reason-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['in-progress', 'missing-blocked-reason', '_overview.md'],
      `---
type: blueprint
status: in-progress
complexity: S
created: 2026-04-02
last_updated: 2026-04-02
---

# missing-blocked-reason

#### Task 1.1: Blocked without reason
**Status:** blocked

**Depends:** None

- [ ] a
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (i) => i.message.includes('1.1') && i.message.includes('missing **Blocked:** reason'),
      ),
    ).toBe(true)
  })

  it('errors when task has no explicit Status line (only checkboxes)', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-no-status-line-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['in-progress', 'no-status', '_overview.md'],
      `---
type: blueprint
status: in-progress
complexity: S
created: 2026-04-02
last_updated: 2026-04-02
---

# no-status

#### Task 1.1: No explicit status
**Depends:** None

- [ ] a
`,
    )

    // This will throw at parseBlueprint level since in-progress requires explicit status
    // We need to test that audit surface catches it at the audit layer; since parseBlueprint
    // will throw, we test that audit result is not-ok
    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true }).catch(() => ({
      ok: false,
      issues: [{ level: 'error' as const, message: 'parse error' }],
    }))
    expect(result.ok).toBe(false)
  })

  it('errors when task has invalid status value', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-invalid-status-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['in-progress', 'invalid-task-status', '_overview.md'],
      `---
type: blueprint
status: in-progress
complexity: S
created: 2026-04-02
last_updated: 2026-04-02
---

# invalid-task-status

#### Task 1.1: Task with invalid status
**Status:** pending

**Depends:** None

- [ ] a
`,
    )

    // parseBlueprint throws on invalid task status value
    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true }).catch(() => ({
      ok: false,
      issues: [{ level: 'error' as const, message: 'invalid status' }],
    }))
    expect(result.ok).toBe(false)
  })

  it('errors when done task has incomplete acceptance criteria (checked < total)', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-done-incomplete-acceptance-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['completed', 'done-incomplete-acceptance', '_overview.md'],
      `---
type: blueprint
status: completed
complexity: S
created: 2026-04-02
last_updated: 2026-04-02
---

# done-incomplete-acceptance

#### Task 1.1: Supposedly done
**Status:** done

**Depends:** None

- [x] First
- [ ] Second
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (i) => i.message.includes('1.1') && i.message.includes('done') && i.message.includes('1/2'),
      ),
    ).toBe(true)
  })
})

describe('runBlueprintAudit — blueprint placement validation', () => {
  it('errors on folder/status mismatch', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-placement-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['planned', 'misplaced', '_overview.md'],
      `---
type: blueprint
status: in-progress
complexity: S
created: 2026-04-02
last_updated: 2026-04-02
---

# misplaced

#### Task 1.1: Task
**Status:** todo

**Depends:** None

- [ ] a
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (i) =>
          i.message.includes('folder=planned') && i.message.includes('frontmatter=in-progress'),
      ),
    ).toBe(true)
  })
})

describe('runBlueprintAudit — execution metadata truth', () => {
  it('errors when execution is running but blueprint status is draft', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-exec-running-draft-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['draft', 'running-but-draft', '_overview.md'],
      `---
type: blueprint
status: draft
complexity: S
created: 2026-04-10
last_updated: 2026-04-10
execution_backend: omx-team
execution_id: team-a
execution_status: running
execution_updated_at: 2026-04-10T11:00:00Z
---

# running-but-draft

#### Task 1.1: Not started yet
**Status:** todo

**Depends:** None

- [ ] a
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (i) =>
          i.message.includes('running') &&
          i.message.includes('draft') &&
          i.message.includes('in-progress'),
      ),
    ).toBe(true)
  })

  it('errors when execution is running but blueprint status is planned', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-exec-running-planned-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['planned', 'running-but-planned', '_overview.md'],
      `---
type: blueprint
status: planned
complexity: S
created: 2026-04-10
last_updated: 2026-04-10
execution_backend: omx-team
execution_id: team-a
execution_status: running
execution_updated_at: 2026-04-10T11:00:00Z
---

# running-but-planned

#### Task 1.1: Not started yet
**Status:** todo

**Depends:** None

- [ ] a
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (i) =>
          i.message.includes('running') &&
          i.message.includes('planned') &&
          i.message.includes('in-progress'),
      ),
    ).toBe(true)
  })

  it('errors when execution is running but blueprint status is parked', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-exec-running-parked-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['parked', 'running-but-parked', '_overview.md'],
      `---
type: blueprint
status: parked
complexity: S
created: 2026-04-10
last_updated: 2026-04-10
execution_backend: omx-team
execution_id: team-a
execution_status: running
execution_updated_at: 2026-04-10T11:00:00Z
---

# running-but-parked

#### Task 1.1: Not started yet
**Status:** todo

**Depends:** None

- [ ] a
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (i) =>
          i.message.includes('running') &&
          i.message.includes('parked') &&
          i.message.includes('in-progress'),
      ),
    ).toBe(true)
  })

  it('errors when execution is stopped but blueprint is completed', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-exec-stopped-completed-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['completed', 'stopped-but-completed', '_overview.md'],
      `---
type: blueprint
status: completed
complexity: S
created: 2026-04-10
last_updated: 2026-04-10
execution_backend: omx-team
execution_id: team-a
execution_status: stopped
execution_updated_at: 2026-04-10T11:00:00Z
---

# stopped-but-completed

#### Task 1.1: Done
**Status:** done

**Depends:** None

- [x] a
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (i) => i.message.includes('execution is stopped') && i.message.includes('marked completed'),
      ),
    ).toBe(true)
  })

  it('errors when execution is blocked but all tasks are done', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-exec-blocked-all-done-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['in-progress', 'blocked-all-done', '_overview.md'],
      `---
type: blueprint
status: in-progress
complexity: S
created: 2026-04-10
last_updated: 2026-04-10
execution_backend: omx-team
execution_id: team-a
execution_status: blocked
execution_updated_at: 2026-04-10T11:00:00Z
---

# blocked-all-done

#### Task 1.1: Done
**Status:** done

**Depends:** None

- [x] a
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (i) =>
          i.message.includes('blocked') &&
          i.message.includes('every task is marked done') &&
          i.message.includes('failed or blocked runtime work'),
      ),
    ).toBe(true)
  })

  it('errors when partial execution metadata is present (missing some fields)', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-partial-exec-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['in-progress', 'partial-exec', '_overview.md'],
      `---
type: blueprint
status: in-progress
complexity: S
created: 2026-04-10
last_updated: 2026-04-10
execution_backend: omx-team
---

# partial-exec

#### Task 1.1: Task
**Status:** todo

**Depends:** None

- [ ] a
`,
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (i) =>
          i.message.includes('partially populated') &&
          i.message.includes('backend, id, status, and updated_at'),
      ),
    ).toBe(true)
  })
})

describe('runBlueprintAudit — isSharedHotFile regex boundary', () => {
  it('demotes pnpm-workspace.yaml to warning (exact match)', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-workspace-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['in-progress', 'active-blueprint', '_overview.md'],
      `---
type: blueprint
status: in-progress
complexity: S
created: 2026-04-02
last_updated: 2026-04-02
---

# active-blueprint

**Files:**
- \`pnpm-workspace.yaml\`

#### Task 1.1: Active
**Status:** in_progress

**Depends:** None

- [ ] a
`,
    )

    const result = await runBlueprintAudit({
      projectRoot,
      strict: true,
      stagedFiles: ['pnpm-workspace.yaml'],
    })
    expect(result.ok).toBe(true)
    const issue = result.issues.find((i) => i.file === 'pnpm-workspace.yaml')
    expect(issue?.level).toBe('warning')
  })

  it('demotes pnpm-lock.yaml to warning (exact match)', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-lockfile-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['in-progress', 'active-blueprint', '_overview.md'],
      `---
type: blueprint
status: in-progress
complexity: S
created: 2026-04-02
last_updated: 2026-04-02
---

# active-blueprint

**Files:**
- \`pnpm-lock.yaml\`

#### Task 1.1: Active
**Status:** in_progress

**Depends:** None

- [ ] a
`,
    )

    const result = await runBlueprintAudit({
      projectRoot,
      strict: true,
      stagedFiles: ['pnpm-lock.yaml'],
    })
    expect(result.ok).toBe(true)
    const issue = result.issues.find((i) => i.file === 'pnpm-lock.yaml')
    expect(issue?.level).toBe('warning')
  })

  it('treats nested package.json (apps/web/package.json) as shared hot file', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-nested-pkg-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['in-progress', 'active-blueprint', '_overview.md'],
      `---
type: blueprint
status: in-progress
complexity: S
created: 2026-04-02
last_updated: 2026-04-02
---

# active-blueprint

**Files:**
- \`apps/web/package.json\`

#### Task 1.1: Active
**Status:** in_progress

**Depends:** None

- [ ] a
`,
    )

    const result = await runBlueprintAudit({
      projectRoot,
      strict: true,
      stagedFiles: ['apps/web/package.json'],
    })
    expect(result.ok).toBe(true)
    const issue = result.issues.find((i) => i.file === 'apps/web/package.json')
    expect(issue?.level).toBe('warning')
  })

  it('does NOT treat package.json.bak as shared hot file (near-miss)', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-near-miss-pkg-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['in-progress', 'active-blueprint', '_overview.md'],
      `---
type: blueprint
status: in-progress
complexity: S
created: 2026-04-02
last_updated: 2026-04-02
---

# active-blueprint

**Files:**
- \`package.json.bak\`

#### Task 1.1: Active
**Status:** in_progress

**Depends:** None

- [ ] a
`,
    )

    const result = await runBlueprintAudit({
      projectRoot,
      strict: true,
      stagedFiles: ['package.json.bak'],
    })
    // package.json.bak does NOT match /(?:^|\/)package\.json$/ — should be error not warning
    expect(result.ok).toBe(false)
    const issue = result.issues.find((i) => i.file === 'package.json.bak')
    expect(issue?.level).toBe('error')
  })
})

describe('runBlueprintAudit — PLL doc truth checks', () => {
  it('errors when PLL docs claim a nonexistent wp blueprint run surface', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-pll-run-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['draft', 'simple-plan', '_overview.md'],
      `---
type: blueprint
status: draft
complexity: S
created: 2026-04-10
last_updated: 2026-04-10
---

# simple-plan

#### Task 1.1: One
**Status:** todo

**Depends:** None

- [ ] a
`,
    )

    mkdirSync(path.join(projectRoot, '.agent', 'commands'), { recursive: true })
    mkdirSync(path.join(projectRoot, '.agent', 'skills', 'pll'), { recursive: true })
    mkdirSync(path.join(projectRoot, '.agent', 'guides'), { recursive: true })
    writeFileSync(
      path.join(projectRoot, '.agent', 'commands', 'pll.md'),
      '# /pll\n\njust wp blueprint run <slug>\n',
      'utf-8',
    )
    writeFileSync(
      path.join(projectRoot, '.agent', 'skills', 'pll', 'SKILL.md'),
      '# skill\n',
      'utf-8',
    )
    writeFileSync(
      path.join(projectRoot, '.agent', 'guides', 'parallel-execution.md'),
      '# guide\n\nblueprint-orchestrator\n',
      'utf-8',
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some((issue) =>
        issue.message.includes('nonexistent `wp blueprint run` execution surface'),
      ),
    ).toBe(true)
    expect(
      result.issues.some((issue) => issue.message.includes('removed local blueprint orchestrator')),
    ).toBe(true)
  })

  it('errors when PLL docs use "just wp blueprint move <slug> in-progress"', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-pll-move-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['draft', 'simple-plan', '_overview.md'],
      `---
type: blueprint
status: draft
complexity: S
created: 2026-04-10
last_updated: 2026-04-10
---

# simple-plan

#### Task 1.1: One
**Status:** todo

**Depends:** None

- [ ] a
`,
    )

    mkdirSync(path.join(projectRoot, '.agent', 'commands'), { recursive: true })
    mkdirSync(path.join(projectRoot, '.agent', 'skills', 'pll'), { recursive: true })
    mkdirSync(path.join(projectRoot, '.agent', 'guides'), { recursive: true })
    writeFileSync(
      path.join(projectRoot, '.agent', 'commands', 'pll.md'),
      '# /pll\n\njust wp blueprint move <slug> in-progress\n',
      'utf-8',
    )
    writeFileSync(
      path.join(projectRoot, '.agent', 'skills', 'pll', 'SKILL.md'),
      '# skill\n',
      'utf-8',
    )
    writeFileSync(
      path.join(projectRoot, '.agent', 'guides', 'parallel-execution.md'),
      '# guide\n',
      'utf-8',
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some((issue) =>
        issue.message.includes('direct blueprint move commands for normal execution'),
      ),
    ).toBe(true)
  })

  it('errors when PLL docs still use "blueprint plans" or "combined-dag"', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-pll-plans-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['draft', 'simple-plan', '_overview.md'],
      `---
type: blueprint
status: draft
complexity: S
created: 2026-04-10
last_updated: 2026-04-10
---

# simple-plan

#### Task 1.1: One
**Status:** todo

**Depends:** None

- [ ] a
`,
    )

    mkdirSync(path.join(projectRoot, '.agent', 'commands'), { recursive: true })
    mkdirSync(path.join(projectRoot, '.agent', 'skills', 'pll'), { recursive: true })
    mkdirSync(path.join(projectRoot, '.agent', 'guides'), { recursive: true })
    writeFileSync(
      path.join(projectRoot, '.agent', 'commands', 'pll.md'),
      '# /pll\n\nRun blueprint plans to see everything.\n',
      'utf-8',
    )
    writeFileSync(
      path.join(projectRoot, '.agent', 'skills', 'pll', 'SKILL.md'),
      '# skill\n',
      'utf-8',
    )
    writeFileSync(
      path.join(projectRoot, '.agent', 'guides', 'parallel-execution.md'),
      '# guide\n',
      'utf-8',
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some((issue) =>
        issue.message.includes('unshipped cross-blueprint execution commands'),
      ),
    ).toBe(true)
  })

  it('errors when PLL docs use TaskUpdate with status="completed" pseudocode', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-pll-task-completed-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['draft', 'simple-plan', '_overview.md'],
      `---
type: blueprint
status: draft
complexity: S
created: 2026-04-10
last_updated: 2026-04-10
---

# simple-plan

#### Task 1.1: One
**Status:** todo

**Depends:** None

- [ ] a
`,
    )

    mkdirSync(path.join(projectRoot, '.agent', 'commands'), { recursive: true })
    mkdirSync(path.join(projectRoot, '.agent', 'skills', 'pll'), { recursive: true })
    mkdirSync(path.join(projectRoot, '.agent', 'guides'), { recursive: true })
    writeFileSync(path.join(projectRoot, '.agent', 'commands', 'pll.md'), '# /pll\n', 'utf-8')
    writeFileSync(
      path.join(projectRoot, '.agent', 'skills', 'pll', 'SKILL.md'),
      '# skill\n',
      'utf-8',
    )
    writeFileSync(
      path.join(projectRoot, '.agent', 'guides', 'parallel-execution.md'),
      '# guide\n\nTaskUpdate(taskId=task.id, status="completed")\n',
      'utf-8',
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(false)
    expect(
      result.issues.some((issue) =>
        issue.message.includes('failed tasks as completed in pseudocode'),
      ),
    ).toBe(true)
  })

  it('passes when PLL docs stay within the shipped lifecycle surface', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-pll-clean-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['draft', 'clean-plan', '_overview.md'],
      `---
type: blueprint
status: draft
complexity: S
created: 2026-04-10
last_updated: 2026-04-10
---

# clean-plan

#### Task 1.1: One
**Status:** todo

**Depends:** None

- [ ] a
`,
    )

    mkdirSync(path.join(projectRoot, '.agent', 'commands'), { recursive: true })
    mkdirSync(path.join(projectRoot, '.agent', 'skills', 'pll'), { recursive: true })
    mkdirSync(path.join(projectRoot, '.agent', 'guides'), { recursive: true })
    writeFileSync(
      path.join(projectRoot, '.agent', 'commands', 'pll.md'),
      '# /pll\n\nUse just wp blueprint start <slug> and just wp blueprint finalize <slug>.\n',
      'utf-8',
    )
    writeFileSync(
      path.join(projectRoot, '.agent', 'skills', 'pll', 'SKILL.md'),
      '# skill\n\nUse wp blueprint task complete <slug> <taskId>.\n',
      'utf-8',
    )
    writeFileSync(
      path.join(projectRoot, '.agent', 'guides', 'parallel-execution.md'),
      '# guide\n\nUse /pll with blueprint lifecycle commands.\n',
      'utf-8',
    )

    const result = await runBlueprintAudit({ projectRoot, all: true, strict: true })
    expect(result.ok).toBe(true)
  })

  it('demotes stage-coherence on shared hot files (package.json, lockfile, workspace) to non-blocking warnings', async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'bp-audit-shared-files-'))
    tempDirs.push(projectRoot)

    writeOverview(
      projectRoot,
      ['in-progress', 'cross-cutting-blueprint', '_overview.md'],
      `---
type: blueprint
status: in-progress
complexity: S
created: 2026-05-03
last_updated: 2026-05-03
---

# cross-cutting-blueprint

**Files:** \`package.json\`, \`pnpm-workspace.yaml\`, \`pnpm-lock.yaml\`, \`apps/web/package.json\`, \`src/feature.ts\`

#### Task 1.1: Active
**Status:** in_progress

**Depends:** None

- [ ] a
`,
    )

    const sharedOnly = await runBlueprintAudit({
      projectRoot,
      strict: true,
      stagedFiles: [
        'package.json',
        'pnpm-workspace.yaml',
        'pnpm-lock.yaml',
        'apps/web/package.json',
      ],
    })
    expect(sharedOnly.ok).toBe(true)
    expect(sharedOnly.issues.every((issue) => issue.level === 'warning')).toBe(true)
    expect(sharedOnly.issues.map((issue) => issue.file).sort()).toEqual([
      'apps/web/package.json',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
    ])

    const sharedAndScoped = await runBlueprintAudit({
      projectRoot,
      strict: true,
      stagedFiles: ['package.json', 'src/feature.ts'],
    })
    expect(sharedAndScoped.ok).toBe(false)
    expect(sharedAndScoped.issues.find((issue) => issue.file === 'src/feature.ts')?.level).toBe(
      'error',
    )
    expect(sharedAndScoped.issues.find((issue) => issue.file === 'package.json')?.level).toBe(
      'warning',
    )
  })
})
