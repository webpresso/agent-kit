import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs')
vi.mock('node:os', () => ({ tmpdir: () => '/tmp' }))

import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'

describe('mcp-sentinel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('PPID', '1234')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('isMcpReady returns false on win32', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    const { isMcpReady } = await import('#hooks/shared/mcp-sentinel')
    expect(isMcpReady()).toBe(false)
  })

  it('isMcpReady returns false when sentinel file is missing', async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    })
    const { isMcpReady } = await import('#hooks/shared/mcp-sentinel')
    expect(isMcpReady()).toBe(false)
  })

  it('isMcpReady returns false when PID is dead (ESRCH)', async () => {
    vi.mocked(readFileSync).mockReturnValue('99999' as unknown as Buffer)
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('ESRCH') as NodeJS.ErrnoException
      err.code = 'ESRCH'
      throw err
    })
    const { isMcpReady } = await import('#hooks/shared/mcp-sentinel')
    expect(isMcpReady()).toBe(false)
    killSpy.mockRestore()
  })

  it('writeSentinel writes own PID to sentinel path', async () => {
    const { writeSentinel } = await import('#hooks/shared/mcp-sentinel')
    writeSentinel()
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
      expect.stringContaining('ak-mcp-ready-'),
      String(process.pid),
      'utf-8',
    )
  })

  it('deleteSentinel removes sentinel file silently', async () => {
    const { deleteSentinel } = await import('#hooks/shared/mcp-sentinel')
    deleteSentinel()
    expect(vi.mocked(unlinkSync)).toHaveBeenCalledWith(expect.stringContaining('ak-mcp-ready-'))
  })

  it('deleteSentinel is silent when file does not exist', async () => {
    vi.mocked(unlinkSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })
    const { deleteSentinel } = await import('#hooks/shared/mcp-sentinel')
    expect(() => deleteSentinel()).not.toThrow()
  })
})
