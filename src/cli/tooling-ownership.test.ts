import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { NotInGitRepoError } from '#paths/state-root.js'

import {
  claimProjectOwnedTool,
  claimUserOwnedTool,
  clearProjectOwnedTool,
  defaultToolingOwnershipState,
  hasAnyOwnership,
  isProjectOwnedTool,
  isUserOwnedTool,
  normalizeToolingOwnershipState,
  readToolingOwnershipState,
  tryReadRepoKey,
  writeToolingOwnershipState,
} from './tooling-ownership.js'

const tempDirs: string[] = []

function makeOwnershipPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wp-tooling-ownership-'))
  tempDirs.push(dir)
  return join(dir, 'tooling-ownership.json')
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('tooling ownership', () => {
  it('defaults to an empty state on missing or invalid files', () => {
    const path = makeOwnershipPath()
    expect(readToolingOwnershipState(path)).toEqual(defaultToolingOwnershipState())
  })

  it('writes and reads user/project ownership entries', () => {
    const path = makeOwnershipPath()
    let state = defaultToolingOwnershipState()
    state = claimUserOwnedTool(state, 'gstack')
    state = claimUserOwnedTool(state, 'omx')
    state = claimProjectOwnedTool(state, 'omc', 'repo-a')
    writeToolingOwnershipState(state, path)

    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
      version: 1,
      tools: {
        gstack: { user: { managedBy: 'wp' } },
        omx: { user: { managedBy: 'wp' } },
        omc: { projects: ['repo-a'] },
      },
    })
    expect(readToolingOwnershipState(path)).toEqual(state)
  })

  it('normalizes malformed payloads by dropping invalid entries', () => {
    expect(
      normalizeToolingOwnershipState({
        version: 1,
        tools: {
          omx: { user: { managedBy: 'wp' }, projects: ['repo-a', 42] },
          omc: { projects: [] },
          gstack: { user: { managedBy: 'other' } },
        },
      }),
    ).toEqual({
      version: 1,
      tools: {
        omx: { user: { managedBy: 'wp' }, projects: ['repo-a'] },
      },
    })
  })

  it('supports claim/read/clear helpers', () => {
    let state = defaultToolingOwnershipState()
    state = claimUserOwnedTool(state, 'omx')
    state = claimProjectOwnedTool(state, 'omx', 'repo-a')
    state = claimProjectOwnedTool(state, 'omx', 'repo-b')

    expect(isUserOwnedTool(state, 'omx')).toBe(true)
    expect(isProjectOwnedTool(state, 'omx', 'repo-a')).toBe(true)
    expect(hasAnyOwnership(state, 'omx')).toBe(true)

    state = clearProjectOwnedTool(state, 'omx', 'repo-a')
    expect(isProjectOwnedTool(state, 'omx', 'repo-a')).toBe(false)
    expect(isProjectOwnedTool(state, 'omx', 'repo-b')).toBe(true)
    expect(hasAnyOwnership(state, 'omx')).toBe(true)
  })

  it('returns null when repo identity cannot be derived', () => {
    const repoKey = tryReadRepoKey('/tmp/no-repo', () => {
      throw new NotInGitRepoError('/tmp/no-repo')
    })
    expect(repoKey).toBeNull()
  })

  it('extracts the repo key from a repo-scoped surface path', () => {
    const repoKey = tryReadRepoKey('/tmp/repo', (_name, _scope, _cwd) =>
      join('/tmp/webpresso-state', 'abc123def4567890', '.probe'),
    )
    expect(repoKey).toBe('abc123def4567890')
  })
})
