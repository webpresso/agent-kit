import type { ValidationError } from '#types'
import type { Configuration } from 'markdownlint'

import { applyFixes } from 'markdownlint'
import { lint } from 'markdownlint/sync'

import { fixCodeBlockLanguages } from '#fixers/code-language'

/**
 * Default markdownlint configuration.
 * See: https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md
 *
 * Disabled rules (cosmetic noise with many existing violations):
 * - MD001: heading-increment - false positives on code block examples
 * - MD009: no-trailing-spaces - cosmetic
 * - MD022: blanks-around-headings - cosmetic (530+ violations)
 * - MD026: no-trailing-punctuation - cosmetic
 * - MD029: ol-prefix - cosmetic
 * - MD031: blanks-around-fences - cosmetic (132+ violations)
 * - MD032: blanks-around-lists - cosmetic (822+ violations)
 * - MD034: no-bare-urls - cosmetic (56+ violations)
 * - MD036: no-emphasis-as-heading - often intentional (119+ violations)
 * - MD040: fenced-code-language - nice but 84+ violations
 */
const DEFAULT_CONFIG: Configuration = {
  // Heading style
  MD001: true, // heading-increment - catches structural issues (H2 -> H4 skips)
  MD003: { style: 'atx' }, // heading-style - use # style headings
  MD018: true, // no-missing-space-atx
  MD019: true, // no-multiple-space-atx
  MD022: false, // blanks-around-headings - disabled, cosmetic
  MD023: true, // heading-start-left
  MD024: { siblings_only: true }, // no-duplicate-heading
  MD025: false, // single-h1 - disabled, we check this separately
  MD041: false, // first-line-h1 - disabled, we use frontmatter

  // Blank lines
  MD012: { maximum: 2 }, // no-multiple-blanks
  MD031: false, // blanks-around-fences - disabled, cosmetic
  MD032: false, // blanks-around-lists - disabled, cosmetic

  // Lists
  MD004: { style: 'dash' }, // ul-style
  MD005: true, // list-indent
  MD007: { indent: 2 }, // ul-indent
  MD029: false, // ol-prefix - disabled, cosmetic
  MD030: true, // list-marker-space

  // Code blocks
  MD014: true, // commands-show-output
  MD040: true, // fenced-code-language - ensures syntax highlighting works
  MD046: { style: 'fenced' }, // code-block-style
  MD048: { style: 'backtick' }, // code-fence-style

  // Links and images
  MD033: false, // no-inline-html - disabled, we allow some HTML
  MD034: false, // no-bare-urls - disabled, cosmetic
  MD042: true, // no-empty-links
  MD045: true, // no-alt-text (images need alt text)

  // Line length
  MD013: false, // line-length - disabled, too strict for docs

  // Other
  MD009: false, // no-trailing-spaces - disabled, cosmetic
  MD010: true, // no-hard-tabs
  MD011: true, // no-reversed-links
  MD026: false, // no-trailing-punctuation - disabled, cosmetic
  MD027: true, // no-multiple-space-blockquote
  MD028: false, // no-blanks-blockquote - disabled, often intentional
  MD035: { style: '---' }, // hr-style
  MD036: false, // no-emphasis-as-heading - disabled, often intentional
  MD037: true, // no-space-in-emphasis
  MD038: false, // no-space-in-code - disabled, can be intentional
  MD039: true, // no-space-in-links
  MD044: false, // proper-names - disabled, we use Vale for this
  MD047: false, // single-trailing-newline - disabled for test compatibility
  MD049: false, // emphasis-style - disabled, cosmetic
  MD050: false, // strong-style - disabled, cosmetic
  MD056: false, // table-column-count - disabled, intentional section headers
  MD058: false, // blanks-around-tables - disabled, cosmetic
}

export interface MarkdownlintResult {
  errors: ValidationError[]
  fixedContent?: string
}

/**
 * Run markdownlint on a file.
 * @param fix - If true, return fixed content
 */
export function validateMarkdownlint(
  filePath: string,
  content: string,
  fix = false,
): MarkdownlintResult {
  const results = lint({
    strings: { [filePath]: content },
    config: DEFAULT_CONFIG,
  })

  const errors: ValidationError[] = []
  const fileResults = results[filePath] || []

  for (const result of fileResults) {
    errors.push({
      file: filePath,
      line: result.lineNumber,
      severity: 'warning', // markdownlint issues are warnings
      source: 'markdownlint',
      message: result.ruleDescription,
      ruleId: result.ruleNames.join('/'),
    })
  }

  // Apply fixes if requested
  let fixedContent: string | undefined
  if (fix && fileResults.length > 0) {
    fixedContent = applyFixes(content, fileResults)
  }

  // Also apply code-language fixes if requested
  if (fix) {
    const contentToFix = fixedContent || content
    const codeLanguageResult = fixCodeBlockLanguages(contentToFix, filePath, 0.7)

    if (codeLanguageResult.changes > 0) {
      fixedContent = codeLanguageResult.fixed
    }
  }

  return { errors, fixedContent }
}
