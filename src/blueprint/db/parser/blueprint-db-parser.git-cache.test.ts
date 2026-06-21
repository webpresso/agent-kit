import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const execSync = vi.hoisted(() => vi.fn(() => 'git@github.com:webpresso/agent-kit.git\n'))

vi.mock('node:child_process', () => ({ execSync }))

const createdRoots: string[] = []

function makeGitRoot(): string {
  const root = join(tmpdir(), `wp-parser-git-cache-${process.pid}-${createdRoots.length}`)
  rmSync(root, { recursive: true, force: true })
  mkdirSync(join(root, 'blueprints', 'completed', 'one'), { recursive: true })
  mkdirSync(join(root, 'blueprints', 'completed', 'two'), { recursive: true })
  writeFileSync(join(root, '.git'), 'gitdir: /tmp/fake.git\n', 'utf8')
  createdRoots.push(root)
  return root
}

const content = `---
type: blueprint
status: completed
---

# Cached org
`

describe('parseBlueprintForDb git organization cache', () => {
  afterEach(() => {
    execSync.mockClear()
    for (const root of createdRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('detects organization once per git root instead of shelling out for every blueprint', async () => {
    const { parseBlueprintForDb } = await import('./blueprint-db-parser.js')
    const root = makeGitRoot()

    const first = parseBlueprintForDb(
      content,
      join(root, 'blueprints', 'completed', 'one', '_overview.md'),
      'one',
    )
    const second = parseBlueprintForDb(
      content,
      join(root, 'blueprints', 'completed', 'two', '_overview.md'),
      'two',
    )

    expect(first.organization).toBe('webpresso')
    expect(second.organization).toBe('webpresso')
    expect(execSync).toHaveBeenCalledTimes(1)
    expect(execSync).toHaveBeenCalledWith('git remote get-url origin', {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 1500,
    })
  })
})
