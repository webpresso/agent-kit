import type { GenerateDocInput } from './types'

import { describe, expect, it } from 'vitest'

import { generateDoc } from './markdown-generator'

describe('generateDoc snapshots', () => {
  it('should generate consistent guide document', () => {
    const input: GenerateDocInput = {
      template: 'guide',
      ssot: {
        frontmatter: {
          type: 'guide',
          last_updated: '2026-02-05',
        },
        sections: {
          Overview: 'This is a comprehensive guide for testing the docs generator.',
          Prerequisites: '- Node.js 20+\n- pnpm 9+',
        },
      },
      llmBlocks: [
        {
          section: 'Getting Started',
          content:
            'Follow these steps to get started:\n\n1. Install dependencies\n2. Configure environment\n3. Run tests',
        },
      ],
    }

    const result = generateDoc(input)

    expect(result.success).toBe(true)
    expect(result.markdown).toMatchSnapshot()
  })

  it('should generate consistent implementation-plan document', () => {
    const input: GenerateDocInput = {
      template: 'blueprint',
      ssot: {
        frontmatter: {
          type: 'blueprint',
          status: 'in-progress',
          complexity: 'M',
          last_updated: '2026-02-05',
        },
        sections: {
          Overview: 'This plan describes the implementation of feature X.',
          'Problem & Goal': 'Users need feature X to accomplish Y.',
        },
      },
      llmBlocks: [
        {
          section: 'Solution',
          content: 'We will implement feature X using approach Z.',
        },
        {
          section: 'Acceptance Criteria',
          content: '- [ ] Criterion 1\n- [ ] Criterion 2\n- [ ] Criterion 3',
        },
      ],
    }

    const result = generateDoc(input)

    expect(result.success).toBe(true)
    expect(result.markdown).toMatchSnapshot()
  })

  it('should generate consistent document with code blocks', () => {
    const input: GenerateDocInput = {
      template: 'guide',
      ssot: {
        frontmatter: {
          type: 'guide',
          last_updated: '2026-02-05',
        },
        sections: {
          Overview: 'Learn how to use the API.',
          'Code Example':
            'Here is a basic example:\n\n```typescript\nimport { generateDoc } from "@webpresso/docs-generator"\n\nconst result = generateDoc({\n  template: "guide",\n  ssot: { frontmatter: {}, sections: {} },\n  llmBlocks: []\n})\n```',
        },
      },
      llmBlocks: [],
    }

    const result = generateDoc(input)

    expect(result.success).toBe(true)
    expect(result.markdown).toMatchSnapshot()
  })

  it('should generate consistent document with nested lists', () => {
    const input: GenerateDocInput = {
      template: 'guide',
      ssot: {
        frontmatter: {
          type: 'guide',
          last_updated: '2026-02-05',
        },
        sections: {
          Overview: 'Configuration options:',
          Options:
            '- **Option A**\n  - Sub-option 1\n  - Sub-option 2\n- **Option B**\n  - Sub-option 3',
        },
      },
      llmBlocks: [],
    }

    const result = generateDoc(input)

    expect(result.success).toBe(true)
    expect(result.markdown).toMatchSnapshot()
  })

  it('should produce identical output across multiple runs', () => {
    const input: GenerateDocInput = {
      template: 'guide',
      ssot: {
        frontmatter: {
          type: 'guide',
          last_updated: '2026-02-05',
        },
        sections: {
          Overview: 'Deterministic content for stability testing.',
        },
      },
      llmBlocks: [
        {
          section: 'Details',
          content: 'Additional LLM-generated content.',
        },
      ],
    }

    const result1 = generateDoc(input)
    const result2 = generateDoc(input)
    const result3 = generateDoc(input)

    expect(result1.markdown).toBe(result2.markdown)
    expect(result2.markdown).toBe(result3.markdown)
    expect(result1.markdown).toMatchSnapshot()
  })
})
