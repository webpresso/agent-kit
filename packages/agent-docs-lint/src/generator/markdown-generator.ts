import type { GenerateDocInput, GenerateDocResult, LlmBlock, SsotData } from './types.js'

import remarkFrontmatter from 'remark-frontmatter'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { stringify as yamlStringify } from 'yaml'

import { validateFrontmatter } from './frontmatter-validator.js'
import { loadTemplate } from './template-loader.js'

/**
 * Generates YAML frontmatter string
 */
function generateFrontmatter(frontmatter: SsotData['frontmatter']): string {
  const cleanFrontmatter: Record<string, string | string[]> = {}

  for (const [key, value] of Object.entries(frontmatter)) {
    if (value !== undefined) {
      cleanFrontmatter[key] = value
    }
  }

  if (!Object.keys(cleanFrontmatter).length) {
    return ''
  }

  return `---\n${yamlStringify(cleanFrontmatter)}---\n`
}

/**
 * Generates markdown sections from SSOT data and LLM blocks
 */
function generateSections(ssotSections: SsotData['sections'], llmBlocks: LlmBlock[]): string {
  const parts: string[] = []

  for (const [sectionName, content] of Object.entries(ssotSections)) {
    parts.push(`## ${sectionName}\n\n${content}`)
  }

  for (const block of llmBlocks) {
    parts.push(`## ${block.section}\n\n${block.content}`)
  }

  return parts.join('\n\n')
}

/**
 * Creates the unified processor for markdown normalization
 */
function createProcessor() {
  return unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkStringify, {
    bullet: '-',
    fence: '`',
    fences: true,
    incrementListMarker: true,
  })
}

/**
 * Processes raw markdown through unified/remark for normalization
 */
function processMarkdown(rawMarkdown: string): GenerateDocResult {
  const processor = createProcessor()

  try {
    const file = processor.processSync(rawMarkdown)
    return {
      success: true,
      markdown: String(file),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      errors: [
        {
          code: 'INVALID_SECTION_CONTENT',
          message: `Failed to process markdown: ${message}`,
        },
      ],
    }
  }
}

/**
 * Main document generation function using unified/remark
 */
export function generateDoc(input: GenerateDocInput): GenerateDocResult {
  const templateResult = loadTemplate(input.template)
  if (!templateResult.success) {
    return {
      success: false,
      errors: templateResult.errors,
    }
  }

  // Schema is guaranteed to exist when success is true
  const { schema } = templateResult
  if (!schema) {
    return {
      success: false,
      errors: [{ code: 'TEMPLATE_PARSE_ERROR', message: 'Template schema is undefined' }],
    }
  }

  const frontmatterErrors = validateFrontmatter(input.ssot.frontmatter, schema)
  if (frontmatterErrors.length > 0) {
    return {
      success: false,
      errors: frontmatterErrors,
    }
  }

  const frontmatterStr = generateFrontmatter(input.ssot.frontmatter)
  const sectionsStr = generateSections(input.ssot.sections, input.llmBlocks)
  const rawMarkdown = `${frontmatterStr}\n${sectionsStr}\n`

  return processMarkdown(rawMarkdown)
}
