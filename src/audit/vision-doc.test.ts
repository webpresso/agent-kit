import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'

import { auditVision } from './vision-doc.js'

function tempRepo() {
  return mkdtempSync(join(tmpdir(), 'agent-kit-vision-audit-'))
}

const TODAY = new Date().toISOString().slice(0, 10)

const validVision = `---
type: vision
last_updated: ${TODAY}
---

# Example Vision

## The problem

A short description of the problem.

## North star

> **One short tagline.**

A short paragraph elaborating it.

## Boundaries

**In scope**

- Things this owns.

**Out of scope**

- Things it does not.

## Design principles

- Be small.
- Be clear.
`

describe('VISION.md audit', () => {
  test('passes a well-formed VISION.md', () => {
    const root = tempRepo()
    writeFileSync(join(root, 'VISION.md'), validVision)
    const result = auditVision(root)
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(1)
    expect(result.violations).toEqual([])
  })

  test('fails when VISION.md is missing', () => {
    const root = tempRepo()
    const result = auditVision(root)
    expect(result.ok).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.message).toContain('required at repo root')
  })

  test('fails on wrong frontmatter type', () => {
    const root = tempRepo()
    writeFileSync(join(root, 'VISION.md'), validVision.replace('type: vision', 'type: research'))
    expect(auditVision(root).violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("type must be 'vision'"),
        }),
      ]),
    )
  })

  test('fails on missing last_updated', () => {
    const root = tempRepo()
    writeFileSync(join(root, 'VISION.md'), validVision.replace(/^last_updated: .*$/m, ''))
    expect(auditVision(root).violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('last_updated') }),
      ]),
    )
  })

  test('fails on invalid last_updated format', () => {
    const root = tempRepo()
    writeFileSync(
      join(root, 'VISION.md'),
      validVision.replace(/^last_updated: .*$/m, 'last_updated: yesterday'),
    )
    expect(auditVision(root).violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('YYYY-MM-DD') }),
      ]),
    )
  })

  test('warns (not errors) when last_updated is older than staleAfterDays', () => {
    const root = tempRepo()
    const old = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10)
    writeFileSync(
      join(root, 'VISION.md'),
      validVision.replace(/^last_updated: .*$/m, `last_updated: ${old}`),
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = auditVision(root, { staleAfterDays: 365 })
    expect(result.ok).toBe(true)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[vision-warn]'))
    warn.mockRestore()
  })

  test('fails when body exceeds line cap', () => {
    const root = tempRepo()
    const padding = Array.from({ length: 110 }, (_, i) => `Line ${i}`).join('\n')
    writeFileSync(join(root, 'VISION.md'), `${validVision}\n${padding}\n`)
    expect(auditVision(root, { maxLines: 100 }).violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('lines; cap is 100') }),
      ]),
    )
  })

  test('fails when body exceeds word cap', () => {
    const root = tempRepo()
    const padding = Array.from({ length: 1600 }, (_, i) => `word${i}`).join(' ')
    writeFileSync(join(root, 'VISION.md'), `${validVision}\n${padding}\n`)
    expect(auditVision(root, { maxWords: 1500 }).violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('words; cap is 1500') }),
      ]),
    )
  })

  test('fails when H1 does not contain Vision', () => {
    const root = tempRepo()
    writeFileSync(
      join(root, 'VISION.md'),
      validVision.replace('# Example Vision', '# Random Heading'),
    )
    expect(auditVision(root).violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("must contain 'Vision'") }),
      ]),
    )
  })

  test('fails when required H2 sections are missing', () => {
    const root = tempRepo()
    writeFileSync(
      join(root, 'VISION.md'),
      `---
type: vision
last_updated: ${TODAY}
---

# Example Vision

Just text, no sections.
`,
    )
    const result = auditVision(root)
    expect(result.ok).toBe(false)
    const messages = result.violations.map((violation) => violation.message)
    expect(messages.some((message) => message.includes("'## Problem'"))).toBe(true)
    expect(messages.some((message) => message.includes("'## North star'"))).toBe(true)
    expect(messages.some((message) => message.includes("'## Boundaries'"))).toBe(true)
    expect(messages.some((message) => message.includes("'## Principles'"))).toBe(true)
  })

  test('accepts synonyms for required sections', () => {
    const root = tempRepo()
    writeFileSync(
      join(root, 'VISION.md'),
      `---
type: vision
last_updated: ${TODAY}
---

# Example Vision

## Problem

a

## Goal

b

## Out of scope

c

## Principles

d
`,
    )
    expect(auditVision(root).ok).toBe(true)
  })
})
