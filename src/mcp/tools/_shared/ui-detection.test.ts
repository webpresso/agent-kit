import { describe, expect, it, vi } from 'vitest'

const execSyncMock = vi.hoisted(() => vi.fn<[string, unknown], string>())

vi.mock('node:child_process', () => ({
  execSync: execSyncMock,
}))

import { detectUiChanges } from './ui-detection.js'

describe('detectUiChanges', () => {
  it('returns false when the git diff contains no UI files', () => {
    execSyncMock.mockReturnValue('src/server/api.ts\nsrc/lib/utils.ts\n')
    expect(detectUiChanges('/some/repo')).toBe(false)
  })

  it('returns true when the diff includes a .tsx file', () => {
    execSyncMock.mockReturnValue('src/components/Button.tsx\nsrc/server/api.ts\n')
    expect(detectUiChanges('/some/repo')).toBe(true)
  })

  it('returns true when the diff includes a .jsx file', () => {
    execSyncMock.mockReturnValue('src/legacy/Widget.jsx\n')
    expect(detectUiChanges('/some/repo')).toBe(true)
  })

  it('returns true when the diff includes a .vue file', () => {
    execSyncMock.mockReturnValue('src/components/App.vue\n')
    expect(detectUiChanges('/some/repo')).toBe(true)
  })

  it('returns true when the diff includes a .svelte file', () => {
    execSyncMock.mockReturnValue('src/routes/+page.svelte\n')
    expect(detectUiChanges('/some/repo')).toBe(true)
  })

  it('returns true when the diff includes a file under apps/client/', () => {
    execSyncMock.mockReturnValue('apps/client/src/main.ts\n')
    expect(detectUiChanges('/some/repo')).toBe(true)
  })

  it('returns true when the diff includes a file under apps/web/', () => {
    execSyncMock.mockReturnValue('apps/web/app/routes/index.tsx\n')
    expect(detectUiChanges('/some/repo')).toBe(true)
  })

  it('returns false when execSync throws (graceful failure)', () => {
    execSyncMock.mockImplementation(() => {
      throw new Error('not a git repo')
    })
    expect(detectUiChanges('/not/a/repo')).toBe(false)
  })

  it('returns false when the diff output is empty', () => {
    execSyncMock.mockReturnValue('')
    expect(detectUiChanges('/some/repo')).toBe(false)
  })
})
