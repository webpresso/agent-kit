import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Inlined from agent-kit blueprint schema (not a dependency of this public package).
// Kept in sync manually. See: webpresso/agent-kit src/blueprint/core/schema.ts
const LIFECYCLE_BLUEPRINT_STATUS_OPTIONS = [
  'draft',
  'planned',
  'parked',
  'in-progress',
  'completed',
  'archived',
] as const
const TASK_STATUS_OPTIONS = ['todo', 'in_progress', 'blocked', 'done'] as const

import { getAvailableTemplates, loadTemplate } from './template-loader'

function findTemplatesRoot(startDir: string): string {
  let current = resolve(startDir)
  for (;;) {
    if (existsSync(join(current, 'templates'))) return current
    const parent = dirname(current)
    if (parent === current) {
      throw new Error(`Could not find agent-docs-lint templates root from: ${startDir}`)
    }
    current = parent
  }
}

describe('loadTemplate', () => {
  describe('successful loading', () => {
    it('should load a valid template', () => {
      const result = loadTemplate('guide')

      expect(result.success).toBe(true)
      expect(typeof result.schema).toBe('object')
      expect(result.schema).not.toBeNull()
      expect(result.schema!.name).toBe('guide')
    })

    it('should parse frontmatter schema correctly', () => {
      const result = loadTemplate('guide')

      expect(result.success).toBe(true)
      expect(typeof result.schema!.frontmatter).toBe('object')
      expect(result.schema!.frontmatter).not.toBeNull()
      expect(typeof result.schema!.frontmatter.required).toBe('object')
      expect(result.schema!.frontmatter.required).not.toBeNull()
      expect(typeof result.schema!.frontmatter.required.type).toBe('object')
      expect(result.schema!.frontmatter.required.type).not.toBeNull()
    })

    it('should parse location patterns', () => {
      const result = loadTemplate('guide')

      expect(result.success).toBe(true)
      expect(typeof result.schema!.location).toBe('object')
      expect(result.schema!.location).not.toBeNull()
      expect(Array.isArray(result.schema!.location.patterns)).toBe(true)
      expect(result.schema!.location.patterns.length).toBeGreaterThan(0)
    })

    it('should load blueprint template', () => {
      const result = loadTemplate('blueprint')

      expect(result.success).toBe(true)
      expect(result.schema!.name).toBe('blueprint')
      expect(result.schema!.frontmatter.required.status).not.toBe(undefined)
      expect(result.schema!.frontmatter.required.status.enum).toContain('draft')
    })

    it('keeps blueprint template status enum aligned with the executable blueprint schema', () => {
      const result = loadTemplate('blueprint')

      expect(result.success).toBe(true)
      expect(result.schema!.frontmatter.required.status.enum).toEqual([
        ...LIFECYCLE_BLUEPRINT_STATUS_OPTIONS,
      ])
      expect(result.schema!.task_format?.required_metadata).toContain(
        `**Status:** ${[...TASK_STATUS_OPTIONS].join('|')}`,
      )
    })
  })

  describe('error handling', () => {
    it('should return error for non-existent template', () => {
      const result = loadTemplate('non-existent-template')

      expect(result.success).toBe(false)
      expect(Array.isArray(result.errors)).toBe(true)
      expect(result.errors!.length).toBe(1)
      expect(result.errors![0]).toEqual(
        expect.objectContaining({
          code: 'TEMPLATE_NOT_FOUND',
        }),
      )
    })

    it('should include template name in error message', () => {
      const result = loadTemplate('my-fake-template')

      expect(result.success).toBe(false)
      expect(result.errors![0].message).toContain('my-fake-template')
    })

    it('should provide actionable error with path hint', () => {
      const templateName = 'invalid'
      const result = loadTemplate(templateName)
      const expectedPath = resolve(
        findTemplatesRoot(import.meta.dirname),
        'templates',
        `${templateName}.yaml`,
      )

      expect(result.success).toBe(false)
      expect(result.errors![0].message).toContain(expectedPath)
      expect(result.errors![0].message).toContain('templates/')
    })
  })
})

describe('getAvailableTemplates', () => {
  it('should return list of available templates', () => {
    const templates = getAvailableTemplates()

    expect(Array.isArray(templates)).toBe(true)
    expect(templates.length).toBeGreaterThan(0)
  })

  it('should include known templates', () => {
    const templates = getAvailableTemplates()

    expect(templates).toContain('guide')
    expect(templates).toContain('blueprint')
    expect(templates).toContain('core-doc')
  })

  it('should return names without .yaml extension', () => {
    const templates = getAvailableTemplates()

    for (const template of templates) {
      expect(template).not.toContain('.yaml')
    }
  })
})
