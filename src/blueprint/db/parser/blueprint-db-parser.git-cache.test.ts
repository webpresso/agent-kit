import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const execSync = vi.hoisted(() => vi.fn(() => 'git@github.com:webpresso/agent-kit.git\n'))

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execSync,
}))

const createdRoots: string[] = []
let rootCounter = 0

function makeGitRoot(remoteOrigin?: string): string {
  const root = join(tmpdir(), `wp-parser-git-cache-${process.pid}-${rootCounter++}`)
  rmSync(root, { recursive: true, force: true })
  mkdirSync(join(root, 'blueprints', 'completed', 'one'), { recursive: true })
  mkdirSync(join(root, 'blueprints', 'completed', 'two'), { recursive: true })
  mkdirSync(join(root, '.git'), { recursive: true })
  writeFileSync(
    join(root, '.git', 'config'),
    remoteOrigin
      ? `[remote "origin"]\n\turl = ${remoteOrigin}\n`
      : '[core]\n\trepositoryformatversion = 0\n',
    'utf8',
  )
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

  it('reads organization from local git config without shelling out', async () => {
    const { parseBlueprintForDb } = await import('./blueprint-db-parser.js')
    const root = makeGitRoot('git@github.com:webpresso/agent-kit.git')

    const parsed = parseBlueprintForDb(
      content,
      join(root, 'blueprints', 'completed', 'one', '_overview.md'),
      'one',
    )

    expect(parsed.organization).toBe('webpresso')
    expect(execSync).not.toHaveBeenCalled()
  })

  it('caches missing organization once per git root without shelling out', async () => {
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

    expect(first.organization).toBe('unknown')
    expect(second.organization).toBe('unknown')
    expect(execSync).not.toHaveBeenCalled()
  })
})
