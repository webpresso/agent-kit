import matter from 'gray-matter'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

export interface RoadmapLinksOptions {
  blueprintsRoot?: string
  failOrphans?: boolean
}

interface BlueprintLinkRecord {
  file: string
  key: string
  name: string
  parentRoadmap?: string
  raw: string
  slug: string
  type: 'blueprint' | 'parent-roadmap'
}

const BLUEPRINT_STATUSES = [
  'draft',
  'planned',
  'in-progress',
  'parked',
  'completed',
  'archived',
] as const

const BLUEPRINT_STATUS_PATTERN = BLUEPRINT_STATUSES.join('|')

export function auditRoadmapLinks(
  rootDirectory: string = process.cwd(),
  options: RoadmapLinksOptions = {},
): RepoAuditResult {
  const root = resolve(rootDirectory)
  const blueprintsRoot = resolve(root, options.blueprintsRoot ?? 'blueprints')
  const records = readBlueprintRecords(root, blueprintsRoot)
  const violations: RepoAuditViolation[] = []
  const byKey = indexBlueprints(records)
  const roadmaps = records.filter((record) => record.type === 'parent-roadmap')
  const localChildrenByRoadmap = new Map<string, BlueprintLinkRecord[]>()

  for (const child of records.filter((record) => record.type !== 'parent-roadmap' && record.parentRoadmap)) {
    const parent = resolveParentRoadmap(child.parentRoadmap ?? '', byKey)
    if (!parent) {
      if (options.failOrphans === true) {
        violations.push({
          file: child.file,
          message: `Blueprint declares parent_roadmap ${JSON.stringify(child.parentRoadmap)} but no local parent-roadmap resolves to it`,
        })
      }
      continue
    }

    const children = localChildrenByRoadmap.get(parent.key) ?? []
    children.push(child)
    localChildrenByRoadmap.set(parent.key, children)
  }

  for (const roadmap of roadmaps) {
    const waveMapChildren = extractWaveMapChildren(roadmap.raw)
    const localChildren = localChildrenByRoadmap.get(roadmap.key) ?? []

    if (waveMapChildren.size === 0 && localChildren.length === 0) {
      violations.push({
        file: roadmap.file,
        message: 'Roadmap declares no children in its wave map',
      })
      continue
    }

    for (const childRef of waveMapChildren) {
      const child = resolveBlueprintReference(childRef, byKey)
      if (!child) {
        violations.push({
          file: roadmap.file,
          message: `Roadmap wave map references missing child blueprint ${JSON.stringify(childRef)}`,
        })
        continue
      }

      if (child.key === roadmap.key) continue

      const claimedParent = child.parentRoadmap
        ? resolveParentRoadmap(child.parentRoadmap, byKey)
        : undefined
      if (claimedParent?.key !== roadmap.key) {
        violations.push({
          file: child.file,
          message: `Child blueprint is listed in ${roadmap.slug} but parent_roadmap does not resolve back to that roadmap`,
        })
      }
    }

    for (const child of localChildren) {
      if (!waveMapChildren.has(child.key) && !waveMapChildren.has(child.name) && !waveMapChildren.has(child.slug)) {
        violations.push({
          file: child.file,
          message: `Child blueprint declares parent_roadmap ${roadmap.slug} but is not listed in the roadmap wave map`,
        })
      }
    }
  }

  return {
    ok: violations.length === 0,
    title: 'Roadmap links',
    checked: roadmaps.length,
    violations,
  }
}

function readBlueprintRecords(root: string, blueprintsRoot: string): BlueprintLinkRecord[] {
  if (!existsSync(blueprintsRoot)) return []

  const records: BlueprintLinkRecord[] = []
  for (const status of BLUEPRINT_STATUSES) {
    const statusRoot = join(blueprintsRoot, status)
    if (!existsSync(statusRoot)) continue

    for (const entry of readdirSync(statusRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const overviewPath = join(statusRoot, entry.name, '_overview.md')
      if (!existsSync(overviewPath)) continue

      const raw = readFileSync(overviewPath, 'utf8')
      const data = matter(raw).data as Record<string, unknown>
      const type = data.type === 'parent-roadmap' ? 'parent-roadmap' : 'blueprint'
      const parentRoadmap =
        typeof data.parent_roadmap === 'string' && data.parent_roadmap.trim()
          ? data.parent_roadmap.trim()
          : undefined
      const key = `${status}/${entry.name}`

      records.push({
        file: relativePath(root, overviewPath),
        key,
        name: entry.name,
        ...(parentRoadmap ? { parentRoadmap } : {}),
        raw,
        slug: key,
        type,
      })
    }
  }

  return records.toSorted((left, right) => left.slug.localeCompare(right.slug))
}

function indexBlueprints(records: readonly BlueprintLinkRecord[]): ReadonlyMap<string, BlueprintLinkRecord> {
  const byKey = new Map<string, BlueprintLinkRecord>()
  for (const record of records) {
    byKey.set(record.key, record)
    byKey.set(record.slug, record)
    byKey.set(record.name, record)
    byKey.set(`blueprints/${record.key}`, record)
    byKey.set(`blueprints/${record.key}/_overview.md`, record)
    byKey.set(`${record.key}/_overview.md`, record)
  }
  return byKey
}

function extractWaveMapChildren(markdown: string): Set<string> {
  const refs = new Set<string>()
  const pathPattern = new RegExp(
    String.raw`(?:blueprints/)?(${BLUEPRINT_STATUS_PATTERN})/([A-Za-z0-9._-]+)(?:/_overview\.md)?`,
    'g',
  )

  for (const match of markdown.matchAll(pathPattern)) {
    const status = match[1]
    const slug = match[2]
    if (!status || !slug) continue
    refs.add(`${status}/${slug}`)
  }

  return refs
}

function resolveBlueprintReference(
  reference: string,
  byKey: ReadonlyMap<string, BlueprintLinkRecord>,
): BlueprintLinkRecord | undefined {
  const normalized = normalizeReference(reference)
  return byKey.get(normalized) ?? byKey.get(lastSegment(normalized))
}

function resolveParentRoadmap(
  parentRoadmap: string,
  byKey: ReadonlyMap<string, BlueprintLinkRecord>,
): BlueprintLinkRecord | undefined {
  for (const candidate of parentRoadmapCandidates(parentRoadmap)) {
    const record = byKey.get(candidate)
    if (record?.type === 'parent-roadmap') return record
  }
  return undefined
}

function parentRoadmapCandidates(parentRoadmap: string): string[] {
  const trimmed = normalizeReference(parentRoadmap)
  if (!trimmed) return []

  const candidates = new Set<string>([trimmed, lastSegment(trimmed)])
  const tail = trimmed.split(/->|→/u).map((part) => part.trim()).filter(Boolean).at(-1)
  if (tail) {
    const normalizedTail = normalizeReference(tail)
    candidates.add(normalizedTail)
    candidates.add(lastSegment(normalizedTail))
  }
  return [...candidates]
}

function normalizeReference(reference: string): string {
  return reference
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^blueprints\//, '')
    .replace(/\/_overview\.md$/, '')
}

function lastSegment(value: string): string {
  return value.split('/').filter(Boolean).at(-1) ?? value
}

function relativePath(root: string, file: string): string {
  return relative(root, file).split(sep).join('/')
}
