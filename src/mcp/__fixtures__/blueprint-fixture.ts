/**
 * Blueprint fixture helper for MCP integration tests.
 *
 * Creates a temp directory with a minimal git structure and blueprint files
 * so that handler functions can be exercised without a real MCP server.
 *
 * Two modes:
 *   - in-memory mode (default): fake git structure via plain mkdir — under 50ms.
 *   - real-git mode ({ realGit: true }): actual `git init` + initial commit — under 1000ms.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { projectIdV1 } from '#projects.js'

export interface BlueprintFixtureSpec {
  readonly slug: string
  readonly title: string
  readonly tasks: ReadonlyArray<{
    readonly id: string
    readonly title: string
    readonly status: 'todo' | 'done'
  }>
  readonly realGit?: boolean
}

export interface BlueprintFixture {
  /** Temp directory that acts as the project root / cwd */
  readonly dir: string
  /** project_id computed via projectIdV1 (using the fake git common-dir) */
  readonly projectId: string
  /** Absolute path to blueprints/in-progress/<slug>/_overview.md */
  readonly blueprintPath: string
  /** Remove the temp directory */
  readonly cleanup: () => void
}

// ---------------------------------------------------------------------------
// Minimal valid frontmatter + task body builder
// ---------------------------------------------------------------------------

function buildOverviewContent(
  title: string,
  tasks: BlueprintFixtureSpec['tasks'],
): string {
  const today = new Date().toISOString().split('T')[0] ?? '2026-01-01'
  const taskBlocks = tasks
    .map(
      (t) =>
        `#### Task ${t.id}: ${t.title}\n\n**Status:** ${t.status}\n**Wave:** 0\n**Files:**\n- (path)\n\n**Acceptance:**\n- [ ] criterion\n`,
    )
    .join('\n')

  return `---
type: blueprint
title: "${title}"
status: in-progress
complexity: M
owner: fixture
created: ${today}
last_updated: ${today}
---

## Product wedge anchor

- **Stage outcome:** fixture stage outcome
- **Consuming surface:** fixture surface route
- **New user-visible capability:** fixture capability

## Summary

Fixture blueprint for integration tests.

## Tasks

${taskBlocks}`
}

// ---------------------------------------------------------------------------
// Core builder
// ---------------------------------------------------------------------------

export async function buildBlueprintFixture(
  spec: BlueprintFixtureSpec,
): Promise<BlueprintFixture> {
  const dir = mkdtempSync(join(tmpdir(), 'wp-bp-fixture-'))

  try {
    let repoCommonDir: string | undefined

    if (spec.realGit === true) {
      // Real git mode: keep the subprocess count minimal so the fixture stays
      // inside the wall-clock budget without weakening the budget itself.
      execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' })
      execFileSync(
        'git',
        [
          '-c',
          'user.email=fixture@test.local',
          '-c',
          'user.name=Fixture',
          'commit',
          '--allow-empty',
          '-m',
          'chore: fixture init',
        ],
        {
          cwd: dir,
          stdio: 'ignore',
        },
      )
      // In a freshly initialized non-worktree repo, the common dir is always .git.
      repoCommonDir = join(dir, '.git')
    } else {
      // In-memory mode: create a fake .git/HEAD to satisfy any git-probe checks
      const dotGit = join(dir, '.git')
      mkdirSync(dotGit, { recursive: true })
      writeFileSync(join(dotGit, 'HEAD'), 'ref: refs/heads/main\n', 'utf8')
      // No real git common-dir — projectIdV1 will get undefined
      repoCommonDir = undefined
    }

    // Create blueprint directory structure
    const blueprintDir = join(dir, 'blueprints', 'in-progress', spec.slug)
    mkdirSync(blueprintDir, { recursive: true })
    const blueprintPath = join(blueprintDir, '_overview.md')
    writeFileSync(blueprintPath, buildOverviewContent(spec.title, spec.tasks), 'utf8')

    // Create a package.json so resolveBlueprintRoot picks up blueprints/ (generic layout)
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'fixture-project', version: '0.0.0' }),
      'utf8',
    )

    const projectId = projectIdV1(dir, repoCommonDir, process.platform)

    return {
      dir,
      projectId,
      blueprintPath,
      cleanup: () => {
        rmSync(dir, { recursive: true, force: true })
      },
    }
  } catch (err) {
    // Clean up on construction failure
    rmSync(dir, { recursive: true, force: true })
    throw err
  }
}
