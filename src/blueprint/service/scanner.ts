/**
 * Plan Directory Scanner
 *
 * Recursively scans the blueprint directory to discover all plan _overview.md files.
 * Handles various directory structures including group/initiative, standalone, and special folders.
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { resolveBlueprintRoot } from '#utils/blueprint-root'

/**
 * Represents a scanned plan with path and metadata extracted from directory structure.
 */
export interface ScannedBlueprint {
  /** Full absolute path to the _overview.md file */
  path: string
  /** Slug derived from directory structure (e.g., 'in-progress/schema-driven-admin-ui-permissions') */
  slug: string
  /** Parent group (e.g., 'in-progress', 'completed'), null for standalone plans */
  group: string | null
  /** True if the plan is in a special folder (_completed, _future, _deprioritized) */
  isSpecialFolder: boolean
  /** Type of special folder if isSpecialFolder is true */
  specialFolderType?: '_completed' | '_future' | '_deprioritized'
}

/**
 * Options for scanning the plan directory.
 */
export interface ScanOptions {
  /** Base directory to scan (default: 'webpresso/blueprints') */
  baseDir?: string
  /** Include plans in special folders (_completed, _future, _deprioritized) (default: false) */
  includeSpecialFolders?: boolean
}

/**
 * Generic options for scanning any document directory.
 */
export interface GenericScanOptions {
  /** Base directory to scan (relative to monorepo root or absolute) */
  baseDir: string
  /** File pattern to match (e.g., '_overview.md', '_task.md') */
  filePattern: string
  /** Include files in special folders (_completed, _future, _deprioritized) (default: false) */
  includeSpecialFolders?: boolean
}

/** Special folder prefixes that indicate archived/deferred plans */
const SPECIAL_FOLDERS = ['_completed', '_future', '_deprioritized'] as const
type SpecialFolderType = (typeof SPECIAL_FOLDERS)[number]

/** Standard plan overview filename */
const OVERVIEW_FILENAME = '_overview.md'
const BLUEPRINT_STATUS_FOLDERS = new Set([
  'draft',
  'planned',
  'parked',
  'in-progress',
  'completed',
  'archived',
])

/**
 * Check if a path component is a special folder.
 */
function isSpecialFolder(name: string): name is SpecialFolderType {
  return SPECIAL_FOLDERS.includes(name as SpecialFolderType)
}

/**
 * Find the special folder type in a path, if any.
 */
function findSpecialFolderType(pathSegments: string[]): SpecialFolderType | undefined {
  for (const segment of pathSegments) {
    if (isSpecialFolder(segment)) {
      return segment
    }
  }
  return undefined
}

function isStatusFolder(name: string): boolean {
  return BLUEPRINT_STATUS_FOLDERS.has(name)
}

/**
 * Extract the slug and group from a plan path.
 *
 * Examples:
 * - 'webpresso/blueprints/agile-workflows/git-task-store/_overview.md'
 *   -> slug: 'agile-workflows/git-task-store', group: 'agile-workflows'
 * - 'webpresso/blueprints/documentation-governance/_overview.md'
 *   -> slug: 'documentation-governance', group: null
 * - 'webpresso/blueprints/_completed/old-plan/_overview.md'
 *   -> slug: '_completed/old-plan', group: null (special folder)
 */
function extractSlugAndGroup(
  fullPath: string,
  baseDir: string,
  filePattern: string = OVERVIEW_FILENAME,
): { slug: string; group: string | null } {
  // Get relative path from base directory
  const relPath = relative(baseDir, fullPath)

  const relSegments = relPath.split('/').filter((s) => s !== '')
  const segments = [...relSegments]

  if (!segments.length) {
    return { slug: '', group: null }
  }

  if (filePattern === OVERVIEW_FILENAME) {
    if (segments[segments.length - 1] === filePattern) {
      segments.pop()
    }
  } else {
    const last = segments[segments.length - 1] ?? ''
    if (last === filePattern) {
      segments[segments.length - 1] = last.replace(/\.md$/i, '')
    }
  }

  if (!segments.length) {
    return { slug: '', group: null }
  }

  // Filter out special folders from the slug calculation for group determination
  const nonSpecialSegments = segments.filter((s) => !isSpecialFolder(s) && !isStatusFolder(s))

  // The slug is the full path (including special folders)
  const slug = segments.join('/')

  // Determine group:
  // - If we have 2+ non-special segments, first non-special is the group
  // - If we have 1 non-special segment, it's a standalone (group = null)
  // - Special folders at root don't count as groups
  let group: string | null = null

  // Find the first non-special segment
  const firstNonSpecialIndex = segments.findIndex(
    (s) => !isSpecialFolder(s) && !isStatusFolder(s),
  )

  if (firstNonSpecialIndex >= 0 && nonSpecialSegments.length >= 2) {
    // There's a group structure: first non-special segment is the group
    group = segments[firstNonSpecialIndex] ?? null
  }

  return { slug, group }
}

/**
 * Check if an entry should be skipped during directory traversal.
 */
function shouldSkipEntry(entry: string): boolean {
  return entry.startsWith('.') || entry === 'node_modules'
}

/**
 * Safely get file stats, returning null on error.
 */
function safeStatSync(fullPath: string): ReturnType<typeof statSync> | null {
  try {
    return statSync(fullPath)
  } catch {
    return null
  }
}

/**
 * Process a _overview.md file and create a ScannedBlueprint if applicable.
 */

/**
 * Get valid directory entries, filtering out hidden and node_modules.
 */
function getValidEntries(dir: string): string[] {
  try {
    return readdirSync(dir).filter((entry) => !shouldSkipEntry(entry))
  } catch {
    return []
  }
}

/**
 * Check if a relative path contains hidden directory components (segments starting with '.').
 */
function containsHiddenDirectory(relativePath: string): boolean {
  const segments = relativePath.split('/')
  return segments.some((segment) => segment.startsWith('.') && segment !== '' && segment !== '.')
}

/**
 * Process a single directory entry and update results/queue.
 */
function processEntry(
  entry: string,
  dir: string,
  baseDir: string,
  filePattern: string,
  includeSpecialFolders: boolean,
  results: ScannedBlueprint[],
  queue: string[],
): void {
  const fullPath = join(dir, entry)
  const stat = safeStatSync(fullPath)

  if (!stat) return

  if (stat.isDirectory()) {
    // Skip directories if the relative path from baseDir contains hidden directory components
    const relativePath = relative(baseDir, fullPath)
    if (!containsHiddenDirectory(relativePath)) {
      queue.push(fullPath)
    }
    return
  }

  // Only accept files matching the pattern
  if (entry === filePattern) {
    const plan = processPlanFile(fullPath, baseDir, includeSpecialFolders, filePattern)
    if (plan) {
      results.push(plan)
    }
    return
  }

  if (
    filePattern === OVERVIEW_FILENAME &&
    entry.endsWith('.md') &&
    entry !== 'README.md' &&
    entry !== OVERVIEW_FILENAME
  ) {
    const plan = processPlanFile(fullPath, baseDir, includeSpecialFolders, entry)
    if (plan) {
      results.push(plan)
    }
  }
}

/**
 * Process a plan file (_overview.md or _overview.md) and create a ScannedBlueprint if applicable.
 */
function processPlanFile(
  fullPath: string,
  baseDir: string,
  includeSpecialFolders: boolean,
  filePattern: string = OVERVIEW_FILENAME,
): ScannedBlueprint | null {
  const relativePath = relative(baseDir, fullPath)

  // Skip files in hidden directories (defense-in-depth check)
  if (containsHiddenDirectory(relativePath)) {
    return null
  }

  const pathSegments = relativePath.split('/')

  const specialFolderType = findSpecialFolderType(pathSegments)
  const isInSpecialFolder = specialFolderType !== undefined

  // Skip special folders unless explicitly included
  if (isInSpecialFolder && !includeSpecialFolders) {
    return null
  }

  const { slug, group } = extractSlugAndGroup(fullPath, baseDir, filePattern)

  const scannedPlan: ScannedBlueprint = {
    path: fullPath,
    slug,
    group,
    isSpecialFolder: isInSpecialFolder,
  }

  if (specialFolderType) {
    scannedPlan.specialFolderType = specialFolderType
  }

  return scannedPlan
}

/**
 * Scan directories iteratively using a queue (avoids recursion complexity).
 */
function scanDirectory(
  startDir: string,
  baseDir: string,
  filePattern: string,
  includeSpecialFolders: boolean,
  results: ScannedBlueprint[],
): void {
  const queue = [startDir]

  while (queue.length > 0) {
    const dir = queue.shift()
    if (!dir) continue

    const entries = getValidEntries(dir)
    for (const entry of entries) {
      processEntry(entry, dir, baseDir, filePattern, includeSpecialFolders, results, queue)
    }
  }
}

/**
 * Generic function to scan any document directory with a specified file pattern.
 *
 * @param options - Generic scan configuration options with baseDir and filePattern
 * @returns Array of scanned documents with path and metadata
 */
export function scanDocumentDirectory(options: GenericScanOptions): ScannedBlueprint[] {
  const { baseDir, filePattern, includeSpecialFolders = false } = options

  let absoluteBaseDir: string

  if (isAbsolute(baseDir)) {
    // Already absolute, use as-is
    absoluteBaseDir = baseDir
  } else {
    // Relative path - resolve from cwd
    absoluteBaseDir = resolve(process.cwd(), baseDir)
  }

  if (!existsSync(absoluteBaseDir)) {
    return []
  }

  const results: ScannedBlueprint[] = []
  scanDirectory(absoluteBaseDir, absoluteBaseDir, filePattern, includeSpecialFolders, results)

  return results
}

/**
 * Scan the blueprint directory for all plan _overview.md files.
 *
 * @param options - Scan configuration options
 * @returns Array of scanned plans with path and metadata
 */
export function scanBlueprintDirectory(options?: ScanOptions): ScannedBlueprint[] {
  const baseDir = options?.baseDir ?? resolveBlueprintRoot()
  const includeSpecialFolders = options?.includeSpecialFolders ?? false

  return scanDocumentDirectory({
    baseDir,
    filePattern: OVERVIEW_FILENAME,
    includeSpecialFolders,
  })
}
