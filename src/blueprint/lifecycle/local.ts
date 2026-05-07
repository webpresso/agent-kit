import type { BlueprintLifecycleIntent, BlueprintLifecycleResult } from './engine.js'

import { mkdir, readFile, readdir, rename, rmdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { applyBlueprintLifecycle } from '#lifecycle/engine'
import { scanBlueprintDirectory } from '#service/scanner'
import { resolveBlueprintRoot } from '#utils/blueprint-root'

export interface ResolvedBlueprintFile {
  path: string
  slug: string
}

export interface BlueprintLifecycleWriteResult extends BlueprintLifecycleResult {
  moved: boolean
  path: string
  slug: string
}

const BLUEPRINT_SLUG_SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isStatusSegment(segment: string | undefined): boolean {
  return (
    segment === 'draft' ||
    segment === 'planned' ||
    segment === 'parked' ||
    segment === 'in-progress' ||
    segment === 'completed' ||
    segment === 'archived'
  )
}

export function relativeBlueprintSlug(slug: string): string {
  const segments = slug.split('/')
  if (segments.length > 1 && isStatusSegment(segments[0])) {
    return segments.slice(1).join('/')
  }
  return slug
}

export function isValidBlueprintSlug(slug: string): boolean {
  const normalized = slug.trim()
  if (normalized.length === 0 || normalized !== slug) {
    return false
  }

  const segments = normalized.split('/')
  return segments.every((segment) => BLUEPRINT_SLUG_SEGMENT_PATTERN.test(segment))
}

function assertValidBlueprintSlug(slug: string): void {
  if (isValidBlueprintSlug(slug)) {
    return
  }

  throw new Error(
    `Invalid blueprint slug: ${slug}. Use lowercase letters, numbers, and hyphen-separated path segments.`,
  )
}

export async function resolveBlueprintFile(
  projectRoot: string,
  slug: string,
): Promise<ResolvedBlueprintFile> {
  assertValidBlueprintSlug(slug)

  const baseDir = resolveBlueprintRoot(projectRoot)
  const scanned = scanBlueprintDirectory({
    baseDir,
    includeSpecialFolders: true,
  })

  const exactMatch = scanned.find((entry) => entry.slug === slug)
  const suffixMatches = scanned.filter(
    (entry) => entry.slug.endsWith(`/${slug}`) || entry.slug === slug,
  )
  const match = exactMatch ?? suffixMatches[0]

  if (!match) {
    const available = scanned.map((entry) => entry.slug).toSorted()
    throw new Error(
      [
        `Blueprint ${slug} not found.`,
        `Available blueprints: ${available.join(', ') || 'none'}`,
      ].join('\n'),
    )
  }

  if (suffixMatches.length > 1 && !exactMatch) {
    throw new Error(
      `Blueprint slug "${slug}" is ambiguous across lifecycle folders. Matches: ${suffixMatches
        .map((entry) => entry.slug)
        .join(', ')}`,
    )
  }

  return { path: match.path, slug: match.slug }
}

async function tryRemoveEmptyParent(dir: string): Promise<void> {
  try {
    const entries = await readdir(dir)
    if (entries.length === 0) {
      await rmdir(dir)
    }
  } catch {
    // Directory may not exist or may not be removable — ignore silently
  }
}

export async function applyBlueprintLifecycleToFile(
  projectRoot: string,
  slug: string,
  intent: BlueprintLifecycleIntent,
): Promise<BlueprintLifecycleWriteResult> {
  const baseDir = resolveBlueprintRoot(projectRoot)
  const location = await resolveBlueprintFile(projectRoot, slug)
  const raw = await readFile(location.path, 'utf-8')
  const mutation = applyBlueprintLifecycle(raw, location.slug, intent)
  const sourceDir = path.dirname(location.path)
  const targetDir = path.join(baseDir, mutation.targetStatus, relativeBlueprintSlug(location.slug))
  const targetPath = path.join(targetDir, '_overview.md')

  if (sourceDir !== targetDir) {
    await mkdir(path.dirname(targetDir), { recursive: true })
    await rename(sourceDir, targetDir)
    await tryRemoveEmptyParent(path.dirname(sourceDir))
  }

  await writeFile(targetPath, mutation.markdown, 'utf-8')

  return {
    ...mutation,
    moved: sourceDir !== targetDir,
    path: targetPath,
    slug: location.slug,
  }
}
