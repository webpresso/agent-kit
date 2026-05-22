/**
 * Minimal YAML frontmatter parser used by the Gemini TOML writer.
 *
 * Intentionally hand-rolled rather than depending on `gray-matter` because
 * `@webpresso/agent-kit/symlinker` must stay runtime-dependency-free at the
 * leaf level — the symlinker ships inside the `wp` CLI and is called from
 * hot paths where pulling in a YAML engine for a single `description:` line
 * is overkill.
 */

export interface ParsedFrontmatter {
  description: string
  body: string
}

export function parseMarkdownFrontmatter(content: string): ParsedFrontmatter {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!fmMatch) return { description: '', body: content }

  const frontmatter = fmMatch[1] ?? ''
  const body = (fmMatch[2] ?? '').trim()

  const descMatch = frontmatter.match(/description:\s*['"]?(.*?)['"]?\s*$/m)
  const description = descMatch?.[1] ?? ''

  return { description, body }
}
