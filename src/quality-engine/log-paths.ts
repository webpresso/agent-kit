import { getPackageShortName, type ResolvedTarget } from './target-resolver.js'

import { join } from 'node:path'

export interface GenerateLogPathOptions {
  context?: string
  logsDir?: string
  includeDateFolder?: boolean
  now?: Date
}

export interface ExtractLogContextOptions {
  packageContext?: (filters: string[]) => string | undefined
  fileContext?: (files: string[]) => string | undefined
}

/**
 * Generate a timestamped log file path for quality commands.
 *
 * Log naming convention:
 *   logs/DD-MM-YYYY/HH-MM-SS_command[-context].log
 *
 * Examples:
 *   logs/12-02-2026/14-23-45_lint.log              # Full workspace lint
 *   logs/12-02-2026/14-25-30_lint-cli2.log         # Package-scoped lint
 *   logs/12-02-2026/14-30-08_test-1770922337.log   # File-scoped test (unix timestamp)
 *   logs/12-02-2026/19-52-00_typecheck.log         # Full workspace typecheck
 *
 * @param command - The quality command being run
 * @param options - Configuration options
 * @returns Relative path to log file (e.g., "logs/12-02-2026/14-23-45_test.log")
 */
export function generateLogPath(
  command: 'test' | 'lint' | 'typecheck' | 'qa' | 'build',
  options: GenerateLogPathOptions = {},
): string {
  const { context, logsDir = 'logs', includeDateFolder = true, now = new Date() } = options

  // Date folder: DD-MM-YYYY
  const dateFolder = [
    String(now.getDate()).padStart(2, '0'),
    String(now.getMonth() + 1).padStart(2, '0'),
    now.getFullYear(),
  ].join('-')

  // Time prefix: HH-MM-SS
  const timePrefix = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('-')

  // Filename: HH-MM-SS_command[-context].log
  const contextSuffix = context ? `-${context}` : ''
  const filename = `${timePrefix}_${command}${contextSuffix}.log`

  return includeDateFolder ? join(logsDir, dateFolder, filename) : join(logsDir, filename)
}

export function extractPackageLogContext(filter: string): string | undefined {
  const packageName = filter.replace(/^--filter=/, '').trim()

  if (!packageName) {
    return undefined
  }

  return getPackageShortName(packageName)
}

export function defaultPackageLogContext(filters: string[]): string | undefined {
  const packages = filters
    .map((filter) => extractPackageLogContext(filter))
    .filter((value): value is string => Boolean(value))

  return packages.length > 0 ? packages.join('-') : undefined
}

/**
 * Extract context string from resolved target for log naming.
 *
 * Context extraction rules:
 * - Full workspace (no targets): No context suffix
 * - Package scope: Use package name(s) - "cli2" or "cli2-config"
 * - File scope: Use unix timestamp (paths too complex to encode)
 * - QA command: No context (always full workspace)
 *
 * @param resolved - Resolved command target
 * @returns Context string for log filename, or undefined for no context
 */
export function extractLogContext(
  resolved: ResolvedTarget,
  options: ExtractLogContextOptions = {},
): string | undefined {
  const {
    packageContext = defaultPackageLogContext,
    fileContext = () => String(Date.now()),
  } = options

  if (resolved.type === 'package' && resolved.value.length > 0) {
    return packageContext(resolved.value)
  }

  if (resolved.type === 'file' && resolved.value.length > 0) {
    return fileContext(resolved.value)
  }

  return undefined
}
