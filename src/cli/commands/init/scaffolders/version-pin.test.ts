import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { checkVersionPin } from './version-pin.js'

const CARET_ZERO_PIN = JSON.stringify({
  agent_kit_version: '0.14.0',
  pins: {
    context_mode: { range: '^0.0.0' },
    rtk: { range: '^0.0.0' },
  },
})

const CARET_NONZERO_PIN = JSON.stringify({
  agent_kit_version: '0.14.0',
  pins: {
    context_mode: { range: '^1.2.3' },
    rtk: { range: '^2.0.0' },
  },
})

describe('checkVersionPin', () => {
  let tmpDir: string
  let pinFile: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ak-version-pin-'))
    pinFile = join(tmpDir, 'compatible-versions.json')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('caret range with major === 0 (^0.Y.Z)', () => {
    it('returns ok when installed version exactly matches the pin', () => {
      writeFileSync(pinFile, CARET_ZERO_PIN)
      const result = checkVersionPin('context_mode', '0.0.0', pinFile)
      expect(result).toStrictEqual({ ok: true })
    })

    it('returns ok when installed patch is greater than pin', () => {
      writeFileSync(pinFile, CARET_ZERO_PIN)
      const result = checkVersionPin('rtk', '0.0.5', pinFile)
      expect(result).toStrictEqual({ ok: true })
    })

    it('returns warning when installed minor differs (^0.Y.Z does not allow minor bump)', () => {
      writeFileSync(pinFile, CARET_ZERO_PIN)
      const result = checkVersionPin('context_mode', '0.1.0', pinFile)
      expect(result.ok).toStrictEqual(false)
      if (!result.ok) {
        expect(result.warning).toContain('context-mode')
        expect(result.warning).toContain('0.1.0')
        expect(result.warning).toContain('^0.0.0')
      }
    })

    it('returns warning when installed major differs', () => {
      writeFileSync(pinFile, CARET_ZERO_PIN)
      const result = checkVersionPin('rtk', '1.0.0', pinFile)
      expect(result.ok).toStrictEqual(false)
      if (!result.ok) {
        expect(result.warning).toContain('rtk')
        expect(result.warning).toContain('1.0.0')
        expect(result.warning).toContain('^0.0.0')
      }
    })
  })

  describe('caret range with major > 0 (^X.Y.Z)', () => {
    it('returns ok when installed version exactly matches the pin', () => {
      writeFileSync(pinFile, CARET_NONZERO_PIN)
      const result = checkVersionPin('context_mode', '1.2.3', pinFile)
      expect(result).toStrictEqual({ ok: true })
    })

    it('returns ok when installed minor is greater (forward-compatible)', () => {
      writeFileSync(pinFile, CARET_NONZERO_PIN)
      const result = checkVersionPin('context_mode', '1.3.0', pinFile)
      expect(result).toStrictEqual({ ok: true })
    })

    it('returns ok when installed patch is greater', () => {
      writeFileSync(pinFile, CARET_NONZERO_PIN)
      const result = checkVersionPin('context_mode', '1.2.9', pinFile)
      expect(result).toStrictEqual({ ok: true })
    })

    it('returns warning when installed minor is below range minor', () => {
      writeFileSync(pinFile, CARET_NONZERO_PIN)
      const result = checkVersionPin('context_mode', '1.1.0', pinFile)
      expect(result.ok).toStrictEqual(false)
      if (!result.ok) {
        expect(result.warning).toContain('context-mode')
        expect(result.warning).toContain('1.1.0')
        expect(result.warning).toContain('^1.2.3')
      }
    })

    it('returns warning when installed major differs', () => {
      writeFileSync(pinFile, CARET_NONZERO_PIN)
      const result = checkVersionPin('context_mode', '2.0.0', pinFile)
      expect(result.ok).toStrictEqual(false)
    })

    it('returns ok for rtk with version satisfying ^2.0.0', () => {
      writeFileSync(pinFile, CARET_NONZERO_PIN)
      const result = checkVersionPin('rtk', '2.1.0', pinFile)
      expect(result).toStrictEqual({ ok: true })
    })

    it('returns warning for rtk below ^2.0.0', () => {
      writeFileSync(pinFile, CARET_NONZERO_PIN)
      const result = checkVersionPin('rtk', '1.9.9', pinFile)
      expect(result.ok).toStrictEqual(false)
      if (!result.ok) {
        expect(result.warning).toContain('rtk')
        expect(result.warning).toContain('1.9.9')
        expect(result.warning).toContain('^2.0.0')
      }
    })
  })

  describe('edge cases', () => {
    it('returns ok when pin file is missing (non-blocking)', () => {
      const result = checkVersionPin('rtk', '1.0.0', join(tmpDir, 'nonexistent.json'))
      expect(result).toStrictEqual({ ok: true })
    })

    it('returns ok when pin file is malformed JSON (non-blocking)', () => {
      writeFileSync(pinFile, 'not-valid-json')
      const result = checkVersionPin('context_mode', '1.0.0', pinFile)
      expect(result).toStrictEqual({ ok: true })
    })

    it('returns ok when the tool key is absent from pins', () => {
      writeFileSync(pinFile, JSON.stringify({ agent_kit_version: '0.14.0', pins: {} }))
      const result = checkVersionPin('rtk', '0.1.0', pinFile)
      expect(result).toStrictEqual({ ok: true })
    })

    it('returns ok when the range field is missing', () => {
      writeFileSync(
        pinFile,
        JSON.stringify({ agent_kit_version: '0.14.0', pins: { rtk: {} } }),
      )
      const result = checkVersionPin('rtk', '1.0.0', pinFile)
      expect(result).toStrictEqual({ ok: true })
    })

    it('handles version strings with leading v prefix', () => {
      writeFileSync(pinFile, CARET_NONZERO_PIN)
      const result = checkVersionPin('context_mode', 'v1.2.3', pinFile)
      expect(result).toStrictEqual({ ok: true })
    })

    it('handles version strings with extra text (e.g. "rtk 1.2.3")', () => {
      writeFileSync(pinFile, CARET_NONZERO_PIN)
      // parseVersion strips non-numeric prefix via regex
      const result = checkVersionPin('context_mode', '1.2.4', pinFile)
      expect(result).toStrictEqual({ ok: true })
    })
  })

  describe('warning message content', () => {
    it('includes compatible-versions.json mention in warning', () => {
      writeFileSync(pinFile, CARET_NONZERO_PIN)
      const result = checkVersionPin('context_mode', '0.9.0', pinFile)
      expect(result.ok).toStrictEqual(false)
      if (!result.ok) {
        expect(result.warning).toContain('compatible-versions.json')
      }
    })

    it('uses "context-mode" label (with hyphen) for context_mode tool', () => {
      writeFileSync(pinFile, CARET_NONZERO_PIN)
      const result = checkVersionPin('context_mode', '0.9.0', pinFile)
      if (!result.ok) {
        expect(result.warning).toContain('context-mode')
        expect(result.warning).not.toContain('context_mode')
      }
    })

    it('uses "rtk" label for rtk tool', () => {
      writeFileSync(pinFile, CARET_NONZERO_PIN)
      const result = checkVersionPin('rtk', '1.0.0', pinFile)
      if (!result.ok) {
        expect(result.warning).toContain('rtk')
      }
    })
  })
})
