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
      stagedFiles: ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'apps/web/package.json'],
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
    expect(
      sharedAndScoped.issues.find((issue) => issue.file === 'src/feature.ts')?.level,
    ).toBe('error')
    expect(
      sharedAndScoped.issues.find((issue) => issue.file === 'package.json')?.level,
    ).toBe('warning')
  })
})
