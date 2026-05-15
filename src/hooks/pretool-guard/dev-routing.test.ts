import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs')
vi.mock('node:constants', () => ({
  O_CREAT: 0o100,
  O_EXCL: 0o200,
  O_WRONLY: 1,
}))
vi.mock('node:os', () => ({ tmpdir: () => '/tmp', homedir: () => '/home/test' }))

import { closeSync, openSync } from 'node:fs'

describe('routeCommand', () => {
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
    const { routeCommand } = await import('./dev-routing.js')
    return routeCommand
  }

  it('just test → deny, guidance mentions ak_test', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('just test')
    expect(result).not.toBeNull()
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('ak_test')
  })

  it('pnpm test --filter foo → deny', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('pnpm test --filter foo')
    expect(result?.action.action).toBe('deny')
  })

  it('vp exec vitest run → deny', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vp exec vitest run')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('ak_test')
  })

  it('pnpm exec vitest run → deny', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('pnpm exec vitest run')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('ak_test')
  })

  it('vitest run → deny', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vitest run')
    expect(result?.action.action).toBe('deny')
  })

  it('just lint --package workers → deny, mentions ak_lint', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('just lint --package workers')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('ak_lint')
  })

  it('vp exec oxlint . → deny, mentions ak_lint', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vp exec oxlint .')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('ak_lint')
  })

  it('pnpm exec oxlint . → deny, mentions ak_lint', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('pnpm exec oxlint .')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('ak_lint')
  })

  it('just typecheck → deny, mentions ak_typecheck', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('just typecheck')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('ak_typecheck')
  })

  it('vp exec tsc --noEmit → deny, mentions ak_typecheck', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vp exec tsc --noEmit')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('ak_typecheck')
  })

  it('pnpm exec tsc --noEmit → deny, mentions ak_typecheck', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('pnpm exec tsc --noEmit')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('ak_typecheck')
  })

  it('just qa → deny, mentions ak_qa', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('just qa')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('ak_qa')
  })

  it('just lint-md README.md → deny, mentions ak_qa', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('just lint-md README.md')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('ak_qa')
  })

  it('pnpm exec markdownlint-cli2 README.md → deny, mentions ak_qa', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('pnpm exec markdownlint-cli2 README.md')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('ak_qa')
  })

  it('vp exec markdownlint-cli2 README.md → deny, mentions ak_qa', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vp exec markdownlint-cli2 README.md')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('ak_qa')
  })

  it('prettier README.md → deny, mentions ak_format', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('prettier README.md')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('ak_format')
  })

  it('pnpm exec prettier README.md --write → deny, mentions ak_format', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('pnpm exec prettier README.md --write')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('ak_format')
  })

  it('markdownlint-cli2 README.md → deny, mentions ak_qa', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('markdownlint-cli2 README.md')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('ak_qa')
  })

  it('just audit blueprint-lifecycle → passthrough (not deny)', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('just audit blueprint-lifecycle')
    expect(result?.action.action).toBe('passthrough')
  })

  it('ak audit docs-frontmatter → passthrough', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('ak audit docs-frontmatter')
    expect(result?.action.action).toBe('passthrough')
  })

  it('git status → passthrough', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('git status')
    expect(result?.action.action).toBe('passthrough')
  })

  it('empty string → null', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('')
    expect(result).toBeNull()
  })

  it('throttle: second call returns passthrough when openSync throws EEXIST', async () => {
    const routeCommand = await getRoute()

    // First call succeeds → deny
    vi.mocked(openSync).mockReturnValueOnce(3)
    const first = routeCommand('just test', 'session-abc')
    expect(first?.action.action).toBe('deny')

    // Second call throws EEXIST → throttled, passthrough
    vi.mocked(openSync).mockImplementationOnce(() => {
      const err = new Error('EEXIST') as NodeJS.ErrnoException
      err.code = 'EEXIST'
      throw err
    })
    const second = routeCommand('just test', 'session-abc')
    expect(second?.action.action).toBe('passthrough')
  })

  it('NFS fallback: openSync throws ENOTSUP → returns deny (not passthrough)', async () => {
    const routeCommand = await getRoute()

    vi.mocked(openSync).mockImplementationOnce(() => {
      const err = new Error('ENOTSUP') as NodeJS.ErrnoException
      err.code = 'ENOTSUP'
      throw err
    })
    const result = routeCommand('just test', 'session-nfs')
    expect(result?.action.action).toBe('deny')
  })
})
