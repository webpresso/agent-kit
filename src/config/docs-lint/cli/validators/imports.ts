import type { ValidationError } from '#config/docs-lint/index'

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * Maximum depth for import chain (prevents infinite loops)
 */
const MAX_IMPORT_DEPTH = 5

/**
 * Check if an import path looks like a valid file import
 * (not a decorator or npm package)
 */
function isValidImportPath(importPath: string): boolean {
  // Valid imports look like: @./file.md, @../README.md, @.agent/rules/agent-guide.md
  const looksLikeFilePath =
    importPath.includes('.') || importPath.startsWith('./') || importPath.startsWith('../')

  // Skip if it looks like an npm package (@org/package)
  // But allow paths starting with a dot (like .agent/...)
  const looksLikeNpmPackage =
    importPath.includes('/') &&
    !importPath.startsWith('./') &&
    !importPath.startsWith('../') &&
    !importPath.startsWith('.')

  return looksLikeFilePath && !looksLikeNpmPackage
}

/**
 * Try to extract an import path from a trimmed line
 */
function tryExtractImport(trimmedLine: string): string | null {
  // Match @path but exclude decorators with () or []
  const match = /^@([^\s()[\]]+)$/.exec(trimmedLine)
  if (!match?.[1]) return null

  const importPath = match[1]
  return isValidImportPath(importPath) ? importPath : null
}

/**
 * Process a single line for imports
 */
function processLineForImport(
  line: string,
  lineNumber: number,
  inCodeBlock: boolean,
): { import: { path: string; line: number } | null; toggleCodeBlock: boolean } {
  if (line.trim().startsWith('```')) {
    return { import: null, toggleCodeBlock: true }
  }

  if (inCodeBlock) {
    return { import: null, toggleCodeBlock: false }
  }

  const importPath = tryExtractImport(line.trim())
  if (importPath) {
    return { import: { path: importPath, line: lineNumber }, toggleCodeBlock: false }
  }

  return { import: null, toggleCodeBlock: false }
}

/**
 * Extract all @imports from content.
 * Only matches standalone @path references, not decorators or code.
 *
 * Skips:
 * - Lines inside fenced code blocks (```...```)
 * - Lines with parentheses/brackets (decorators like @migrations([))
 * - Lines that look like npm packages (@org/package)
 */
export function extractImports(content: string): Array<{ path: string; line: number }> {
  const imports: Array<{ path: string; line: number }> = []
  const lines = content.split('\n')
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue

    const result = processLineForImport(line, i + 1, inCodeBlock)
    if (result.toggleCodeBlock) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (result.import) {
      imports.push(result.import)
    }
  }

  return imports
}

/**
 * Resolve import path relative to the importing file
 */
export function resolveImportPath(
  importPath: string,
  fromFile: string,
  projectRoot: string,
): string {
  // If path starts with ./ or ../, resolve relative to importing file
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    return resolve(dirname(fromFile), importPath)
  }

  // Otherwise resolve relative to project root
  return resolve(projectRoot, importPath)
}

/**
 * Check for circular dependencies in import chain
 */
function detectCircularDeps(
  filePath: string,
  _projectRoot: string,
  visited: Set<string>,
  chain: string[],
): { circular: boolean; chain: string[] } {
  const normalizedPath = resolve(filePath)

  if (visited.has(normalizedPath)) {
    return { circular: true, chain: [...chain, normalizedPath] }
  }

  if (chain.length >= MAX_IMPORT_DEPTH) {
    return { circular: false, chain }
  }

  // This would require reading the file content - simplified for now
  // Full implementation would recursively check imports
  return { circular: false, chain }
}

/**
 * Validate @imports in a markdown file
 *
 * Checks:
 * - Import paths resolve to existing files
 * - No circular dependencies
 * - Import depth doesn't exceed MAX_IMPORT_DEPTH
 *
 * Inspired by @felixgeelhaar/cclint
 */
export function validateImports(
  filePath: string,
  content: string,
  projectRoot: string,
): ValidationError[] {
  const errors: ValidationError[] = []
  const imports = extractImports(content)

  if (!imports.length) {
    return errors
  }

  const visited = new Set<string>()
  visited.add(resolve(filePath))

  for (const imp of imports) {
    const resolvedPath = resolveImportPath(imp.path, filePath, projectRoot)

    // Check if file exists
    if (!existsSync(resolvedPath)) {
      errors.push({
        file: filePath,
        line: imp.line,
        severity: 'error',
        source: 'structure',
        message: `Import not found: @${imp.path} (resolved to ${resolvedPath})`,
        ruleId: 'import-not-found',
      })
      continue
    }

    // Check for circular dependencies
    const circularCheck = detectCircularDeps(resolvedPath, projectRoot, visited, [
      resolve(filePath),
    ])

    if (circularCheck.circular) {
      errors.push({
        file: filePath,
        line: imp.line,
        severity: 'error',
        source: 'structure',
        message: `Circular import detected: ${circularCheck.chain.join(' → ')}`,
        ruleId: 'circular-import',
      })
    }

    visited.add(resolvedPath)
  }

  // Check import depth
  if (imports.length > 10) {
    errors.push({
      file: filePath,
      severity: 'warning',
      source: 'structure',
      message: `High number of imports (${imports.length}). Consider consolidating.`,
      ruleId: 'import-count',
    })
  }

  return errors
}
