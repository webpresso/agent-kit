import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs')
vi.mock('node:constants', () => ({
  O_CREAT: 0o100,
  O_EXCL: 0o200,
  O_WRONLY: 1,
}))
vi.mock('node:os', () => ({ tmpdir: () => '/tmp' }))

import { closeSync, openSync } from 'node:fs'

describe('routeDevCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Default: openSync succeeds (first call)
    vi.mocked(openSync).mockReturnValue(3)
    vi.mocked(closeSync).mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  async function getRoute() {
    const { routeDevCommand } = await import('./dev-routing.js')
    return routeDevCommand
  }

  it('just test → deny, guidance mentions ak_test', async () => {
    const routeDevCommand = await getRoute()
    const result = routeDevCommand('just test')
    expect(result).not.toBeNull()
    expect(result?.action).toBe('deny')
    expect(result?.guidance).toContain('ak_test')
  })

  it('pnpm test --filter foo → deny', async () => {
    const routeDevCommand = await getRoute()
    const result = routeDevCommand('pnpm test --filter foo')
    expect(result).not.toBeNull()
    expect(result?.action).toBe('deny')
  })

  it('vitest run → deny', async () => {
    const routeDevCommand = await getRoute()
    const result = routeDevCommand('vitest run')
    expect(result).not.toBeNull()
    expect(result?.action).toBe('deny')
  })

  it('just lint --package workers → deny, mentions ak_lint', async () => {
    const routeDevCommand = await getRoute()
    const result = routeDevCommand('just lint --package workers')
    expect(result).not.toBeNull()
    expect(result?.action).toBe('deny')
    expect(result?.guidance).toContain('ak_lint')
  })

  it('just typecheck → deny, mentions ak_typecheck', async () => {
    const routeDevCommand = await getRoute()
    const result = routeDevCommand('just typecheck')
    expect(result).not.toBeNull()
    expect(result?.action).toBe('deny')
    expect(result?.guidance).toContain('ak_typecheck')
  })

  it('just qa → deny, mentions ak_qa', async () => {
    const routeDevCommand = await getRoute()
    const result = routeDevCommand('just qa')
    expect(result).not.toBeNull()
    expect(result?.action).toBe('deny')
    expect(result?.guidance).toContain('ak_qa')
  })

  it('just audit blueprint-lifecycle → null (passthrough)', async () => {
    const routeDevCommand = await getRoute()
    const result = routeDevCommand('just audit blueprint-lifecycle')
    expect(result).toBeNull()
  })

  it('ak audit docs-frontmatter → null (passthrough)', async () => {
    const routeDevCommand = await getRoute()
    const result = routeDevCommand('ak audit docs-frontmatter')
    expect(result).toBeNull()
  })

  it('git status → null (passthrough)', async () => {
    const routeDevCommand = await getRoute()
    const result = routeDevCommand('git status')
    expect(result).toBeNull()
  })

  it('empty string → null', async () => {
    const routeDevCommand = await getRoute()
    const result = routeDevCommand('')
    expect(result).toBeNull()
  })

  it('throttle: second call returns null when openSync throws EEXIST', async () => {
    const routeDevCommand = await getRoute()

    // First call succeeds
    vi.mocked(openSync).mockReturnValueOnce(3)
    const first = routeDevCommand('just test', 'session-abc')
    expect(first).not.toBeNull()
    expect(first?.action).toBe('deny')

    // Second call throws EEXIST
    vi.mocked(openSync).mockImplementationOnce(() => {
      const err = new Error('EEXIST') as NodeJS.ErrnoException
      err.code = 'EEXIST'
      throw err
    })
    const second = routeDevCommand('just test', 'session-abc')
    expect(second).toBeNull()
  })

  it('NFS fallback: openSync throws ENOTSUP → returns deny (not null)', async () => {
    const routeDevCommand = await getRoute()

    vi.mocked(openSync).mockImplementationOnce(() => {
      const err = new Error('ENOTSUP') as NodeJS.ErrnoException
      err.code = 'ENOTSUP'
      throw err
    })
    const result = routeDevCommand('just test', 'session-nfs')
    expect(result).not.toBeNull()
    expect(result?.action).toBe('deny')
  })
})
