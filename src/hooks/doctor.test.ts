import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs')
vi.mock('node:os', () => ({ platform: () => 'linux' }))
vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

import { spawn } from 'node:child_process'
import { accessSync, statSync } from 'node:fs'

const mockSpawn = vi.mocked(spawn)
const mockAccessSync = vi.mocked(accessSync)
const mockStatSync = vi.mocked(statSync)

describe('hooks/doctor', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('AK_DOCTOR_MCP_TIMEOUT_MS', '1000')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const fakeProcess = (overrides: Partial<typeof process> = {}) => ({
    ...process,
    platform: 'linux' as typeof process.platform,
    ppid: 1234,
    pid: 5678,
    ...overrides,
  })

  describe('runHooksDoctor', () => {
    it('returns false when no bins are found', async () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })
      vi.stubGlobal('process', fakeProcess())

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor()
      expect(result.ok).toBe(false)
    })

    it('skips executable check on win32', async () => {
      vi.mock('node:os', () => ({ platform: () => 'win32' }))

      mockAccessSync.mockImplementation((() => true) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o644 } as unknown as ReturnType<typeof statSync>)

      vi.stubGlobal('process', { ...fakeProcess(), platform: 'win32' })

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor()
      const pretoolCheck = result.checks.find((c) => c.name === 'pretool-guard')
      expect(pretoolCheck?.detail).not.toContain('not executable')
    })

    it('skips MCP check when skipMcp is true', async () => {
      mockAccessSync.mockImplementation((() => true) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)

      vi.stubGlobal('process', fakeProcess())

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })
      const mcpCheck = result.checks.find((c) => c.name === 'MCP server liveness')
      expect(mcpCheck?.ok).toBe(true)
      expect(mcpCheck?.detail).toContain('skipped')
    })
  })
})
