import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'

const PACKAGE_ROOT = resolve(import.meta.dirname, '..', '..')
const COMMANDS_DIR = join(PACKAGE_ROOT, 'commands')
const EXPECTED_COMMANDS = ['test', 'qa', 'audit', 'blueprint'] as const

describe('plugin commands directory', () => {
  it('commands/ directory exists', () => {
    expect(existsSync(COMMANDS_DIR)).toBe(true)
  })

  it('contains exactly 4 *.md command files', () => {
    const files = readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.md'))
    expect(files.sort()).toEqual(EXPECTED_COMMANDS.map((c) => `${c}.md`).sort())
  })

  for (const cmd of EXPECTED_COMMANDS) {
    describe(`commands/${cmd}.md`, () => {
      const filePath = join(COMMANDS_DIR, `${cmd}.md`)

      it('exists', () => {
        expect(existsSync(filePath)).toBe(true)
      })

      it('is fewer than 30 lines', () => {
        const raw = readFileSync(filePath, 'utf-8')
        const lineCount = raw.split('\n').length
        expect(lineCount).toBeLessThan(30)
      })

      it('has YAML frontmatter with a non-empty description', () => {
        const raw = readFileSync(filePath, 'utf-8')
        const parsed = matter(raw)
        expect(typeof parsed.data.description).toBe('string')
        expect((parsed.data.description as string).trim().length).toBeGreaterThan(0)
      })

      it(`body references mcp__agent-kit__wp_${cmd}`, () => {
        const raw = readFileSync(filePath, 'utf-8')
        const parsed = matter(raw)
        expect(parsed.content).toContain(`mcp__agent-kit__wp_${cmd}`)
      })
    })
  }
})
