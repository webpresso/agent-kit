import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}))

import { runPreflight } from './preflight.js'

const mockExistsSync = vi.mocked(existsSync)
const mockSpawnSync = vi.mocked(spawnSync)

function makeSpawnResult(stdout: string, status = 0): ReturnType<typeof spawnSync> {
  return {
    pid: 1,
    output: [],
    stdout,
    stderr: '',
    status,
    signal: null,
    error: undefined,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('runPreflight', () => {
  describe('matching repo — all 5 checks pass', () => {
    it('returns ok: true, score: 5, warnings: [] and prints a green line', async () => {
      // tsconfig.json, wrangler.toml (workers), blueprints/, .agent/ all exist
      mockExistsSync.mockImplementation((p) => {
        const s = String(p)
        return (
          s.endsWith('tsconfig.json') ||
          s.endsWith('wrangler.toml') ||
          s.endsWith('blueprints') ||
          s.endsWith('.agent')
        )
      })
      // Node ≥ 24 — process.version is read directly
      const originalVersion = process.version
      Object.defineProperty(process, 'version', { value: 'v24.0.0', configurable: true })
      // pnpm ≥ 10
      mockSpawnSync.mockReturnValue(makeSpawnResult('10.33.0'))

      const result = await runPreflight('/fake/repo', false)

      Object.defineProperty(process, 'version', { value: originalVersion, configurable: true })

      expect(result).toStrictEqual({ ok: true, score: 5, warnings: [] })
    })

    it('accepts webpresso/blueprints when the webpresso sentinel is present', async () => {
      mockExistsSync.mockImplementation((p) => {
        const s = String(p)
        return (
          s.endsWith('tsconfig.json') ||
          s.endsWith('wrangler.toml') ||
          s.endsWith('webpresso/config.yaml') ||
          s.endsWith('webpresso/blueprints') ||
          s.endsWith('.agent')
        )
      })
      const originalVersion = process.version
      Object.defineProperty(process, 'version', { value: 'v24.0.0', configurable: true })
      mockSpawnSync.mockReturnValue(makeSpawnResult('10.33.0'))

      const result = await runPreflight('/fake/repo', false)

      Object.defineProperty(process, 'version', { value: originalVersion, configurable: true })

      expect(result).toStrictEqual({ ok: true, score: 5, warnings: [] })
    })
  })

  describe('missing tsconfig.json', () => {
    it('returns ok: true, score: 4, warnings with tsconfig message', async () => {
      mockExistsSync.mockImplementation((p) => {
        const s = String(p)
        // tsconfig missing
        return s.endsWith('wrangler.toml') || s.endsWith('blueprints') || s.endsWith('.agent')
      })
      const originalVersion = process.version
      Object.defineProperty(process, 'version', { value: 'v24.0.0', configurable: true })
      mockSpawnSync.mockReturnValue(makeSpawnResult('10.33.0'))

      const result = await runPreflight('/fake/repo', false)

      Object.defineProperty(process, 'version', { value: originalVersion, configurable: true })

      expect(result.ok).toStrictEqual(true)
      expect(result.score).toStrictEqual(4)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('tsconfig.json')
    })
  })

  describe('node version below 24', () => {
    it('includes node version warning', async () => {
      mockExistsSync.mockImplementation((p) => {
        const s = String(p)
        return (
          s.endsWith('tsconfig.json') ||
          s.endsWith('wrangler.toml') ||
          s.endsWith('blueprints') ||
          s.endsWith('.agent')
        )
      })
      const originalVersion = process.version
      Object.defineProperty(process, 'version', { value: 'v22.0.0', configurable: true })
      mockSpawnSync.mockReturnValue(makeSpawnResult('10.33.0'))

      const result = await runPreflight('/fake/repo', false)

      Object.defineProperty(process, 'version', { value: originalVersion, configurable: true })

      expect(result.ok).toStrictEqual(true)
      expect(result.score).toStrictEqual(4)
      expect(result.warnings[0]).toContain('Node')
    })
  })

  describe('pnpm below 10', () => {
    it('returns score 4 with pnpm warning', async () => {
      mockExistsSync.mockImplementation((p) => {
        const s = String(p)
        return (
          s.endsWith('tsconfig.json') ||
          s.endsWith('wrangler.toml') ||
          s.endsWith('blueprints') ||
          s.endsWith('.agent')
        )
      })
      const originalVersion = process.version
      Object.defineProperty(process, 'version', { value: 'v24.0.0', configurable: true })
      // pnpm 9.x — below requirement
      mockSpawnSync.mockReturnValue(makeSpawnResult('9.15.0'))

      const result = await runPreflight('/fake/repo', false)

      Object.defineProperty(process, 'version', { value: originalVersion, configurable: true })

      expect(result.ok).toStrictEqual(true)
      expect(result.score).toStrictEqual(4)
      expect(result.warnings[0]).toContain('pnpm')
    })
  })

  describe('pnpm not found', () => {
    it('returns score 4 with pnpm warning when spawn fails', async () => {
      mockExistsSync.mockImplementation((p) => {
        const s = String(p)
        return (
          s.endsWith('tsconfig.json') ||
          s.endsWith('wrangler.toml') ||
          s.endsWith('blueprints') ||
          s.endsWith('.agent')
        )
      })
      const originalVersion = process.version
      Object.defineProperty(process, 'version', { value: 'v24.0.0', configurable: true })
      // pnpm not on PATH
      mockSpawnSync.mockReturnValue(makeSpawnResult('', 1))

      const result = await runPreflight('/fake/repo', false)

      Object.defineProperty(process, 'version', { value: originalVersion, configurable: true })

      expect(result.ok).toStrictEqual(true)
      expect(result.score).toStrictEqual(4)
      expect(result.warnings[0]).toContain('pnpm')
    })
  })

  describe('neither wrangler.toml nor vite.config.ts', () => {
    it('returns score 4 with workers/vite warning', async () => {
      mockExistsSync.mockImplementation((p) => {
        const s = String(p)
        return s.endsWith('tsconfig.json') || s.endsWith('blueprints') || s.endsWith('.agent')
      })
      const originalVersion = process.version
      Object.defineProperty(process, 'version', { value: 'v24.0.0', configurable: true })
      mockSpawnSync.mockReturnValue(makeSpawnResult('10.33.0'))

      const result = await runPreflight('/fake/repo', false)

      Object.defineProperty(process, 'version', { value: originalVersion, configurable: true })

      expect(result.ok).toStrictEqual(true)
      expect(result.score).toStrictEqual(4)
      expect(result.warnings[0]).toContain('wrangler.toml')
    })
  })

  describe('missing blueprints/', () => {
    it('returns score 4 with blueprints warning', async () => {
      mockExistsSync.mockImplementation((p) => {
        const s = String(p)
        return s.endsWith('tsconfig.json') || s.endsWith('wrangler.toml') || s.endsWith('.agent')
      })
      const originalVersion = process.version
      Object.defineProperty(process, 'version', { value: 'v24.0.0', configurable: true })
      mockSpawnSync.mockReturnValue(makeSpawnResult('10.33.0'))

      const result = await runPreflight('/fake/repo', false)

      Object.defineProperty(process, 'version', { value: originalVersion, configurable: true })

      expect(result.ok).toStrictEqual(true)
      expect(result.score).toStrictEqual(4)
      expect(result.warnings[0]).toContain('blueprints')
    })

    it('mentions webpresso/blueprints when the webpresso sentinel selects that layout', async () => {
      mockExistsSync.mockImplementation((p) => {
        const s = String(p)
        return (
          s.endsWith('tsconfig.json') ||
          s.endsWith('wrangler.toml') ||
          s.endsWith('webpresso/config.yaml') ||
          s.endsWith('.agent')
        )
      })
      const originalVersion = process.version
      Object.defineProperty(process, 'version', { value: 'v24.0.0', configurable: true })
      mockSpawnSync.mockReturnValue(makeSpawnResult('10.33.0'))

      const result = await runPreflight('/fake/repo', false)

      Object.defineProperty(process, 'version', { value: originalVersion, configurable: true })

      expect(result.ok).toStrictEqual(true)
      expect(result.score).toStrictEqual(4)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('webpresso/blueprints/')
    })
  })

  describe('missing .agent/', () => {
    it('returns score 4 with lore commit warning', async () => {
      mockExistsSync.mockImplementation((p) => {
        const s = String(p)
        return (
          s.endsWith('tsconfig.json') || s.endsWith('wrangler.toml') || s.endsWith('blueprints')
        )
      })
      const originalVersion = process.version
      Object.defineProperty(process, 'version', { value: 'v24.0.0', configurable: true })
      mockSpawnSync.mockReturnValue(makeSpawnResult('10.33.0'))

      const result = await runPreflight('/fake/repo', false)

      Object.defineProperty(process, 'version', { value: originalVersion, configurable: true })

      expect(result.ok).toStrictEqual(true)
      expect(result.score).toStrictEqual(4)
      expect(result.warnings[0]).toContain('.agent')
    })
  })

  describe('strict mode + mismatch', () => {
    it('returns ok: false when score < 5 and strict is true', async () => {
      mockExistsSync.mockImplementation((p) => {
        const s = String(p)
        // missing tsconfig and .agent
        return s.endsWith('wrangler.toml') || s.endsWith('blueprints')
      })
      const originalVersion = process.version
      Object.defineProperty(process, 'version', { value: 'v24.0.0', configurable: true })
      mockSpawnSync.mockReturnValue(makeSpawnResult('10.33.0'))

      const result = await runPreflight('/fake/repo', true)

      Object.defineProperty(process, 'version', { value: originalVersion, configurable: true })

      expect(result.ok).toStrictEqual(false)
      expect(result.score).toStrictEqual(3)
      expect(result.warnings.length).toBeGreaterThanOrEqual(2)
    })

    it('returns ok: true when all 5 pass even with strict=true', async () => {
      mockExistsSync.mockImplementation((p) => {
        const s = String(p)
        return (
          s.endsWith('tsconfig.json') ||
          s.endsWith('wrangler.toml') ||
          s.endsWith('blueprints') ||
          s.endsWith('.agent')
        )
      })
      const originalVersion = process.version
      Object.defineProperty(process, 'version', { value: 'v24.0.0', configurable: true })
      mockSpawnSync.mockReturnValue(makeSpawnResult('10.33.0'))

      const result = await runPreflight('/fake/repo', true)

      Object.defineProperty(process, 'version', { value: originalVersion, configurable: true })

      expect(result).toStrictEqual({ ok: true, score: 5, warnings: [] })
    })
  })

  describe('multiple mismatches', () => {
    it('accumulates all warnings', async () => {
      // Only wrangler.toml exists — 4 checks fail
      mockExistsSync.mockImplementation((p) => String(p).endsWith('wrangler.toml'))
      const originalVersion = process.version
      Object.defineProperty(process, 'version', { value: 'v20.0.0', configurable: true })
      mockSpawnSync.mockReturnValue(makeSpawnResult('8.0.0'))

      const result = await runPreflight('/fake/repo', false)

      Object.defineProperty(process, 'version', { value: originalVersion, configurable: true })

      expect(result.ok).toStrictEqual(true) // non-strict always ok
      expect(result.score).toStrictEqual(1)
      expect(result.warnings).toHaveLength(4)
    })
  })
})
