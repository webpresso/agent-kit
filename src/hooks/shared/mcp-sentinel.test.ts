import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs')
vi.mock('node:os', () => ({ tmpdir: () => '/tmp' }))

import { readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'

describe('mcp-sentinel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('WP_MCP_SENTINEL_KEY', 'test-fixture-key')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('isMcpReady returns false on win32', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    const { isMcpReady } = await import('#hooks/shared/mcp-sentinel')
    expect(isMcpReady()).toBe(false)
  })

  it('isMcpReady returns false when no sentinel files exist', async () => {
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>)
    const { isMcpReady } = await import('#hooks/shared/mcp-sentinel')
    expect(isMcpReady()).toBe(false)
  })

  it('isMcpReady returns false when readdirSync throws', async () => {
    vi.mocked(readdirSync).mockImplementation(() => {
      throw new Error('EACCES')
    })
    const { isMcpReady } = await import('#hooks/shared/mcp-sentinel')
    expect(isMcpReady()).toBe(false)
  })

  it('isMcpReady returns false when only stale (dead PID) sentinels exist', async () => {
    vi.mocked(readdirSync).mockReturnValue([
      'wp-mcp-ready-99999',
      'wp-mcp-ready-88888',
    ] as unknown as ReturnType<typeof readdirSync>)
    vi.mocked(readFileSync).mockImplementation((path): ReturnType<typeof readFileSync> => {
      if (typeof path === 'string' && path.endsWith('99999'))
        return '99999' as unknown as ReturnType<typeof readFileSync>
      if (typeof path === 'string' && path.endsWith('88888'))
        return '88888' as unknown as ReturnType<typeof readFileSync>
      throw new Error('unexpected path')
    })
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('ESRCH') as NodeJS.ErrnoException
      err.code = 'ESRCH'
      throw err
    })
    const { isMcpReady } = await import('#hooks/shared/mcp-sentinel')
    expect(isMcpReady()).toBe(false)
    killSpy.mockRestore()
  })

  it('isMcpReady returns true when ANY sentinel contains a live PID (cross-cwd resilient)', async () => {
    vi.mocked(readdirSync).mockReturnValue([
      'wp-mcp-ready-99999', // dead
      'unrelated-file',
      'wp-mcp-ready-12345', // alive
    ] as unknown as ReturnType<typeof readdirSync>)
    vi.mocked(readFileSync).mockImplementation((path): ReturnType<typeof readFileSync> => {
      if (typeof path === 'string' && path.endsWith('99999'))
        return '99999' as unknown as ReturnType<typeof readFileSync>
      if (typeof path === 'string' && path.endsWith('12345'))
        return '12345' as unknown as ReturnType<typeof readFileSync>
      throw new Error('unexpected path')
    })
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid) => {
      if (pid === 99999) {
        const err = new Error('ESRCH') as NodeJS.ErrnoException
        err.code = 'ESRCH'
        throw err
      }
      return true
    })
    const { isMcpReady } = await import('#hooks/shared/mcp-sentinel')
    expect(isMcpReady()).toBe(true)
    killSpy.mockRestore()
  })

  it('isMcpReady ignores non-sentinel filenames in tmpdir', async () => {
    vi.mocked(readdirSync).mockReturnValue([
      'random.log',
      'something-else',
      'wp-mcp-readyish-12345', // wrong prefix (no trailing dash)
    ] as unknown as ReturnType<typeof readdirSync>)
    const killSpy = vi.spyOn(process, 'kill')
    const { isMcpReady } = await import('#hooks/shared/mcp-sentinel')
    expect(isMcpReady()).toBe(false)
    expect(killSpy).not.toHaveBeenCalled()
    killSpy.mockRestore()
  })

  it('isMcpReady skips files with unparsable PIDs', async () => {
    vi.mocked(readdirSync).mockReturnValue(['wp-mcp-ready-bogus'] as unknown as ReturnType<
      typeof readdirSync
    >)
    vi.mocked(readFileSync).mockReturnValue(
      'not-a-pid' as unknown as ReturnType<typeof readFileSync>,
    )
    const { isMcpReady } = await import('#hooks/shared/mcp-sentinel')
    expect(isMcpReady()).toBe(false)
  })

  it('writeSentinel writes own PID to its own keyed sentinel path', async () => {
    const { writeSentinel } = await import('#hooks/shared/mcp-sentinel')
    writeSentinel()
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
      '/tmp/wp-mcp-ready-test-fixture-key',
      String(process.pid),
      'utf-8',
    )
  })

  it('writeSentinel uses process.pid as key when WP_MCP_SENTINEL_KEY is unset', async () => {
    vi.stubEnv('WP_MCP_SENTINEL_KEY', '')
    const { writeSentinel } = await import('#hooks/shared/mcp-sentinel')
    writeSentinel()
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
      `/tmp/wp-mcp-ready-${process.pid}`,
      String(process.pid),
      'utf-8',
    )
  })

  it('deleteSentinel removes its own sentinel file silently', async () => {
    const { deleteSentinel } = await import('#hooks/shared/mcp-sentinel')
    deleteSentinel()
    expect(vi.mocked(unlinkSync)).toHaveBeenCalledWith('/tmp/wp-mcp-ready-test-fixture-key')
  })

  it('deleteSentinel is silent when file does not exist', async () => {
    vi.mocked(unlinkSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })
    const { deleteSentinel } = await import('#hooks/shared/mcp-sentinel')
    expect(() => deleteSentinel()).not.toThrow()
  })
})
