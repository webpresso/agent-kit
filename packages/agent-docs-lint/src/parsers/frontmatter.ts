import type { ParsedDocument } from '#types'

import matter from 'gray-matter'

/**
 * Parse a markdown file and extract frontmatter.
 * Uses gray-matter for YAML frontmatter parsing.
 */
export function parseFrontmatter(content: string): ParsedDocument {
  const hasFrontmatter = content.trimStart().startsWith('---')

  if (!hasFrontmatter) {
    return {
      frontmatter: {},
      content: content,
      hasFrontmatter: false,
    }
  }

  const parsed = matter(content)

  return {
    frontmatter: parsed.data as Record<string, unknown>,
    content: parsed.content,
    hasFrontmatter: true,
  }
}

/**
 * Format a single frontmatter value into YAML lines
 */
function formatFrontmatterValue(key: string, value: unknown): string[] {
  if (Array.isArray(value)) {
    if (!value.length) return []
    return [`${key}:`, ...value.map((item) => `  - ${item}`)]
  }

  if (typeof value === 'object' && value !== null) {
    // Skip nested objects for now
    return []
  }

  return [`${key}: ${value}`]
}

/**
 * Generate YAML frontmatter string from an object.
 */
export function generateFrontmatter(data: Record<string, unknown>): string {
  // Filter out undefined values
  const filtered = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))

  if (!Object.keys(filtered).length) {
    return ''
  }

  const lines = ['---']

  for (const [key, value] of Object.entries(filtered)) {
    lines.push(...formatFrontmatterValue(key, value))
  }

  lines.push('---')
  return lines.join('\n')
}

/**
 * Add or update frontmatter in a markdown document.
 * Returns the new document content.
 */
export function updateFrontmatter(content: string, newData: Record<string, unknown>): string {
  const parsed = parseFrontmatter(content)

  // Merge existing frontmatter with new data
  const merged = { ...parsed.frontmatter, ...newData }
  const frontmatterStr = generateFrontmatter(merged)

  if (!frontmatterStr) {
    return parsed.content
  }

  return `${frontmatterStr}\n${parsed.content.trimStart()}`
}
