import { describe, expect, it } from 'vitest'

import {
  detectDocType,
  generateFrontmatter,
  getSchema,
  normalizeDocType,
  parseFrontmatter,
  updateFrontmatter,
} from './index.js'
import { validateFrontmatter } from './generator/index.js'
import { baseFrontmatter, schemaRegistry } from './schemas/index.js'

describe('folded docs-lint API parity', () => {
  it('exposes the main parser and schema APIs from the local docs-lint entrypoint', () => {
    const parsed = parseFrontmatter('---\ntitle: Example\n---\n# Body\n')

    expect(parsed).toEqual({
      frontmatter: { title: 'Example' },
      content: '# Body\n',
      hasFrontmatter: true,
    })
    expect(generateFrontmatter({ title: 'Example', tags: ['docs', 'lint'] })).toBe(
      '---\ntitle: Example\ntags:\n  - docs\n  - lint\n---',
    )
    expect(updateFrontmatter('# Body\n', { title: 'Example' })).toBe(
      '---\ntitle: Example\n---\n# Body\n',
    )
    expect(normalizeDocType('blueprint')).toBe('blueprint')
    expect(normalizeDocType('unexpected')).toBe('unknown')
    expect(detectDocType('webpresso/blueprints/planned/example/_overview.md')).toBe('blueprint')
    expect(getSchema('guide')).toBe(baseFrontmatter)
    expect(Object.keys(schemaRegistry).sort()).toEqual([
      'blueprint',
      'decision',
      'guide',
      'research',
      'system',
      'unknown',
    ])
  })

  it('exposes generator validation APIs without requiring CLI entrypoints', () => {
    const errors = validateFrontmatter(
      { status: 'done' },
      {
        name: 'parity',
        description: 'parity fixture',
        frontmatter: {
          required: {
            status: {
              enum: ['draft', 'planned'],
              description: 'valid lifecycle status',
            },
            owner: {
              description: 'document owner',
            },
          },
        },
        sections: {
          required: [{ name: 'Overview' }],
        },
        location: {
          patterns: ['docs/**'],
        },
        naming: {
          pattern: '*.md',
          case: 'lower',
        },
      },
    )

    expect(errors).toEqual([
      expect.objectContaining({
        code: 'INVALID_FRONTMATTER_VALUE',
        field: 'status',
        actual: 'done',
      }),
      expect.objectContaining({
        code: 'MISSING_REQUIRED_FRONTMATTER',
        field: 'owner',
      }),
    ])
  })
})
