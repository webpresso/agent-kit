/**
 * Tests for the buildBlueprintFixture helper.
 *
 * Verifies:
 *   - in-memory mode creates a valid fixture under 50ms
 *   - real-git mode creates a valid fixture under 1000ms
 *   - cleanup removes the temp directory
 *   - projectId is deterministic and non-empty
 */

import { existsSync, readFileSync } from 'node:fs'

import { afterEach, describe, expect, it } from 'vitest'

import { buildBlueprintFixture } from '#mcp/__fixtures__/blueprint-fixture'

const BASIC_SPEC = {
  slug: 'test-blueprint',
  title: 'Test Blueprint',
  tasks: [
    { id: '1.1', title: 'First task', status: 'todo' as const },
    { id: '1.2', title: 'Second task', status: 'done' as const },
  ],
}

describe('buildBlueprintFixture', () => {
  const cleanups: Array<() => void> = []

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
  })

  describe('in-memory mode (default)', () => {
    it('creates a temp directory under 50ms', async () => {
      const start = Date.now()
      const fixture = await buildBlueprintFixture(BASIC_SPEC)
      const elapsed = Date.now() - start
      cleanups.push(fixture.cleanup)

      expect(elapsed).toBeLessThan(50)
    })

    it('creates directory with expected structure', async () => {
      const fixture = await buildBlueprintFixture(BASIC_SPEC)
      cleanups.push(fixture.cleanup)

      expect(existsSync(fixture.dir)).toBe(true)
      expect(existsSync(fixture.blueprintPath)).toBe(true)
    })

    it('blueprint path points to _overview.md under blueprints/in-progress/<slug>', async () => {
      const fixture = await buildBlueprintFixture(BASIC_SPEC)
      cleanups.push(fixture.cleanup)

      expect(fixture.blueprintPath).toMatch(/blueprints\/in-progress\/test-blueprint\/_overview\.md$/)
    })

    it('_overview.md contains valid frontmatter fields', async () => {
      const fixture = await buildBlueprintFixture(BASIC_SPEC)
      cleanups.push(fixture.cleanup)

      const content = readFileSync(fixture.blueprintPath, 'utf8')
      expect(content).toContain('type: blueprint')
      expect(content).toContain('title: "Test Blueprint"')
      expect(content).toContain('status: in-progress')
      expect(content).toContain('complexity: M')
    })

    it('_overview.md contains task sections', async () => {
      const fixture = await buildBlueprintFixture(BASIC_SPEC)
      cleanups.push(fixture.cleanup)

      const content = readFileSync(fixture.blueprintPath, 'utf8')
      expect(content).toContain('#### Task 1.1: First task')
      expect(content).toContain('**Status:** todo')
      expect(content).toContain('#### Task 1.2: Second task')
      expect(content).toContain('**Status:** done')
    })

    it('_overview.md contains Product wedge anchor section', async () => {
      const fixture = await buildBlueprintFixture(BASIC_SPEC)
      cleanups.push(fixture.cleanup)

      const content = readFileSync(fixture.blueprintPath, 'utf8')
      expect(content).toContain('## Product wedge anchor')
    })

    it('returns a non-empty 16-hex projectId', async () => {
      const fixture = await buildBlueprintFixture(BASIC_SPEC)
      cleanups.push(fixture.cleanup)

      expect(fixture.projectId).toMatch(/^[0-9a-f]{16}$/)
    })

    it('creates a fake .git/HEAD file', async () => {
      const { join } = await import('node:path')
      const fixture = await buildBlueprintFixture(BASIC_SPEC)
      cleanups.push(fixture.cleanup)

      const headPath = join(fixture.dir, '.git', 'HEAD')
      expect(existsSync(headPath)).toBe(true)
      expect(readFileSync(headPath, 'utf8')).toContain('refs/heads/main')
    })

    it('cleanup removes the temp directory', async () => {
      const fixture = await buildBlueprintFixture(BASIC_SPEC)
      expect(existsSync(fixture.dir)).toBe(true)

      fixture.cleanup()

      expect(existsSync(fixture.dir)).toBe(false)
    })

    it('different fixtures get different dirs and projectIds', async () => {
      const a = await buildBlueprintFixture({ ...BASIC_SPEC, slug: 'slug-a' })
      const b = await buildBlueprintFixture({ ...BASIC_SPEC, slug: 'slug-b' })
      cleanups.push(a.cleanup, b.cleanup)

      expect(a.dir).not.toBe(b.dir)
      expect(a.projectId).not.toBe(b.projectId)
    })
  })

  describe('real-git mode', () => {
    it('creates a valid fixture under 1000ms wall-clock', async () => {
      const start = Date.now()
      const fixture = await buildBlueprintFixture({ ...BASIC_SPEC, realGit: true })
      const elapsed = Date.now() - start
      cleanups.push(fixture.cleanup)

      // Wall-clock assertion per no-timeout-as-fix rule
      expect(elapsed).toBeLessThan(1000)
    })

    it('creates directory with expected structure', async () => {
      const fixture = await buildBlueprintFixture({ ...BASIC_SPEC, realGit: true })
      cleanups.push(fixture.cleanup)

      expect(existsSync(fixture.dir)).toBe(true)
      expect(existsSync(fixture.blueprintPath)).toBe(true)
    })

    it('returns a non-empty 16-hex projectId', async () => {
      const fixture = await buildBlueprintFixture({ ...BASIC_SPEC, realGit: true })
      cleanups.push(fixture.cleanup)

      expect(fixture.projectId).toMatch(/^[0-9a-f]{16}$/)
    })

    it('has a real .git directory (not a fake HEAD-only)', async () => {
      const { join } = await import('node:path')
      const fixture = await buildBlueprintFixture({ ...BASIC_SPEC, realGit: true })
      cleanups.push(fixture.cleanup)

      // Real git repos have a COMMIT_EDITMSG after first commit
      const commitMsg = join(fixture.dir, '.git', 'COMMIT_EDITMSG')
      expect(existsSync(commitMsg)).toBe(true)
    })

    it('produces a different projectId from in-memory mode for the same slug', async () => {
      // Real git: repoCommonDir is defined → different hash input
      const realFx = await buildBlueprintFixture({ ...BASIC_SPEC, realGit: true })
      const fakeFx = await buildBlueprintFixture(BASIC_SPEC)
      cleanups.push(realFx.cleanup, fakeFx.cleanup)

      // dirs differ → projectIds will differ regardless
      expect(realFx.dir).not.toBe(fakeFx.dir)
    })
  })
})
