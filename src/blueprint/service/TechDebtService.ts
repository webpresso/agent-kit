/**
 * TechDebtService
 *
 * Manages technical debt items stored in git.
 * Scans webpresso/tech-debt recursively for markdown files.
 * Extends TrackedDocumentService to provide filtering, sorting, and query capabilities.
 */

import type { BlueprintRecord } from '#query/types'

import matter from 'gray-matter'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import {
  isCategory,
  isSeverity,
  isTechDebtStatus,
  parseTechDebt,
  type TechDebtItem,
  type TechDebtQueryFilters,
  type TechDebtQueryResult,
  type TechDebtRecord,
  type TechDebtSortOptions,
} from '#tech-debt/index'
import { calculateFreshness } from '#utils/freshness'

import { toBlueprintRecord } from './blueprint-records'
import { linkBlueprintToTechDebt, unlinkBlueprintFromTechDebt } from './blueprint-tech-debt-links'
import { computePriorityScore as computePriorityScoreAlgorithm } from './priority-scoring'
import { scanBlueprintDirectory, scanDocumentDirectory } from './scanner'
import { TrackedDocumentService } from './TrackedDocumentService'

export interface TechDebtSummary {
  slug: string
  title: string
  status: string
  severity: string
  category?: string
  priorityScore: number
  nextReview?: string
  malformed?: string // Error message if tech debt couldn't be parsed
}

export interface TechDebtQueryOptions {
  filters?: TechDebtQueryFilters
  sort?: TechDebtSortOptions
  limit?: number
  offset?: number
}

export class TechDebtService extends TrackedDocumentService<
  TechDebtSummary,
  TechDebtRecord,
  TechDebtQueryFilters,
  TechDebtSortOptions,
  TechDebtQueryResult
> {
  constructor(projectPath?: string) {
    // If projectPath is provided, use it; otherwise let scanner find monorepo root
    const techDebtDir = projectPath
      ? path.join(projectPath, 'webpresso/tech-debt')
      : 'webpresso/tech-debt'
    super(techDebtDir, 'README.md', projectPath)
  }

  // Implementation of abstract list() method
  list(): Promise<TechDebtSummary[]> {
    return this.listTechDebt()
  }

  async listTechDebt(): Promise<TechDebtSummary[]> {
    const scannedItems = scanDocumentDirectory({
      baseDir: this.baseDir,
      filePattern: this.filePattern,
      includeSpecialFolders: true,
    })

    const items: TechDebtSummary[] = []
    for (const scanned of scannedItems) {
      const summary = await this.tryParseTechDebtSummary(scanned)
      if (summary) {
        items.push(summary)
      }
    }
    return items
  }

  private async tryParseTechDebtSummary(scanned: {
    path: string
    slug: string
  }): Promise<TechDebtSummary | null> {
    try {
      const content = await fs.readFile(scanned.path, 'utf-8')
      return this.parseSummary(content, scanned.slug)
    } catch (error) {
      return this.handleParseSummaryError(error, scanned)
    }
  }

  protected parseSummary(content: string, slug: string): TechDebtSummary {
    const item = parseTechDebt(content, slug)
    return {
      slug: item.slug,
      title: item.title,
      status: item.status,
      severity: item.severity,
      category: item.category,
      priorityScore: item.basePriority,
      nextReview: item.nextReview,
    }
  }

  protected buildMalformedSummary(
    scanned: { path: string; slug: string },
    data: Record<string, unknown>,
    errorMessage: string,
  ): TechDebtSummary {
    return {
      slug: scanned.slug,
      title: (data.title as string) || scanned.slug,
      status: (data.status as string) || 'unknown',
      severity: (data.severity as string) || 'unknown',
      category: data.category as string | undefined,
      priorityScore: 0,
      malformed: errorMessage,
    }
  }

  // Implementation of abstract get() method
  get(slug: string): Promise<TechDebtItem> {
    return this.getTechDebt(slug)
  }

  async getTechDebt(slug: string): Promise<TechDebtItem> {
    // Try direct path first (supports both 'category/item' and 'item')
    const itemPath = path.join(this.baseDir, slug, 'README.md')
    try {
      await fs.access(itemPath)
      const content = await fs.readFile(itemPath, 'utf-8')
      return parseTechDebt(content, slug)
    } catch {
      // Scan all items to find a match by slug
      const scannedItems = scanDocumentDirectory({
        baseDir: this.baseDir,
        filePattern: this.filePattern,
        includeSpecialFolders: true,
      })

      const found = scannedItems.find((p) => p.slug === slug || p.slug.endsWith(`/${slug}`))
      if (!found) {
        throw new Error(
          `TechDebt item not found: ${slug}\nAvailable items:\n${scannedItems.map((p) => `  - ${p.slug}`).join('\n')}`,
        )
      }

      const content = await fs.readFile(found.path, 'utf-8')
      return parseTechDebt(content, found.slug)
    }
  }

  async query(options?: TechDebtQueryOptions): Promise<TechDebtQueryResult> {
    const scannedItems = scanDocumentDirectory({
      baseDir: this.baseDir,
      filePattern: this.filePattern,
    })
    const itemRecords = await this.buildRecords(scannedItems)

    const { records, totalFiltered } = this.processQueryPipeline(itemRecords, options)

    return {
      items: records,
      summary: this.computeQuerySummary(itemRecords, totalFiltered),
    }
  }

  /**
   * Get tech debt items that are past their review date
   */
  async getOverdueReviews(): Promise<TechDebtRecord[]> {
    const result = await this.query({
      filters: { overdue: true },
    })
    return result.items
  }

  /**
   * Get tech debt items by category
   */
  async getByCategory(category: string): Promise<TechDebtRecord[]> {
    if (!isCategory(category)) {
      throw new Error(`Invalid category: ${category}`)
    }
    const result = await this.query({
      filters: { category },
    })
    return result.items
  }

  /**
   * Get tech debt items by severity
   */
  async getBySeverity(severity: string): Promise<TechDebtRecord[]> {
    if (!isSeverity(severity)) {
      throw new Error(`Invalid severity: ${severity}`)
    }
    const result = await this.query({
      filters: { severity },
    })
    return result.items
  }

  /**
   * Link a tech debt item to a blueprint (bidirectional)
   * Updates both the tech debt document and blueprint frontmatter
   * @param tdSlug - TechDebt slug
   * @param bpSlug - Blueprint slug
   * @throws Error if either document doesn't exist
   */
  async linkToBlueprint(tdSlug: string, bpSlug: string): Promise<void> {
    // Verify both documents exist
    const itemPath = path.join(this.baseDir, tdSlug, 'README.md')
    await fs.access(itemPath) // Throws if tech debt not found
    await linkBlueprintToTechDebt(
      this.projectPath
        ? path.join(this.projectPath, 'webpresso/blueprints')
        : 'webpresso/blueprints',
      this.projectPath,
      bpSlug,
      tdSlug,
    )
  }

  /**
   * Unlink a tech debt item from a blueprint (bidirectional)
   * Updates both the tech debt document and blueprint frontmatter
   * @param tdSlug - TechDebt slug
   * @param bpSlug - Blueprint slug
   */
  async unlinkFromBlueprint(tdSlug: string, bpSlug: string): Promise<void> {
    await unlinkBlueprintFromTechDebt(
      this.projectPath
        ? path.join(this.projectPath, 'webpresso/blueprints')
        : 'webpresso/blueprints',
      this.projectPath,
      bpSlug,
      tdSlug,
    )
  }

  /**
   * Get all blueprints linked to a tech debt item
   * @param tdSlug - TechDebt slug
   * @returns Array of BlueprintRecord objects
   */
  async getLinkedBlueprints(tdSlug: string): Promise<import('../query/types').BlueprintRecord[]> {
    // Read fresh from disk and deep-clone to avoid gray-matter shared state issues
    const itemPath = path.join(this.baseDir, tdSlug, 'README.md')
    const content = await fs.readFile(itemPath, 'utf-8')
    const parsed = matter(content)
    const data = JSON.parse(JSON.stringify(parsed.data))
    const linkedBlueprints = (data.linked_blueprints as string[]) ?? []

    if (!linkedBlueprints.length) {
      return []
    }

    const blueprintsDir = this.projectPath
      ? path.join(this.projectPath, 'webpresso/blueprints')
      : 'webpresso/blueprints'
    const scannedBlueprints = scanBlueprintDirectory({
      baseDir: blueprintsDir,
      includeSpecialFolders: true,
    })
    const matchingBlueprints = scannedBlueprints.filter(
      (blueprint) =>
        linkedBlueprints.includes(blueprint.slug) ||
        linkedBlueprints.some((linked) => blueprint.slug.endsWith(`/${linked}`)),
    )

    const records = await Promise.all(
      matchingBlueprints.map((blueprint) =>
        toBlueprintRecord(blueprint.path, blueprint.slug, blueprint.group),
      ),
    )

    return records.filter(
      (record): record is import('../query/types').BlueprintRecord => record !== null,
    )
  }

  /**
   * Compute priority score for a tech debt item
   *
   * Calculates a 0-100 priority score based on:
   * - Severity (10-40 points)
   * - Staleness (0-30 points) - days since last review
   * - Overdue review (0-20 points)
   * - Active blueprint link (0-10 points)
   * - Category urgency (0-5 points) - security=5, testing=3
   *
   * @param item - The tech debt record to score
   * @param linkedBlueprints - Blueprints that reference this tech debt item
   * @returns Priority score from 0-100 (higher = more urgent)
   */
  computePriorityScore(item: TechDebtRecord, linkedBlueprints: BlueprintRecord[]): number {
    return computePriorityScoreAlgorithm(item, linkedBlueprints)
  }

  private static readonly FRESHNESS_STATUS_MAP: Record<
    string,
    'draft' | 'in-progress' | 'planned' | 'completed' | 'archived'
  > = {
    accepted: 'planned',
    'needs-remediation': 'in-progress',
    monitoring: 'planned',
    resolved: 'completed',
  }

  private static computeFreshness(lastReviewed: Date | undefined, status: string) {
    const freshnessStatus = TechDebtService.FRESHNESS_STATUS_MAP[status] ?? 'in-progress'
    return lastReviewed
      ? calculateFreshness(lastReviewed, freshnessStatus)
      : { score: 0.5, daysSinceUpdate: 0, status: 'aging' as const }
  }

  protected async toRecord(
    filePath: string,
    slug: string,
    group: string | null,
  ): Promise<TechDebtRecord | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const item = parseTechDebt(content, slug)

      const lastReviewed = item.lastReviewed ? new Date(item.lastReviewed) : undefined
      const validCategory = item.category && isCategory(item.category) ? item.category : undefined

      return {
        slug,
        title: item.title,
        status: isTechDebtStatus(item.status) ? item.status : 'needs-remediation',
        severity: isSeverity(item.severity) ? item.severity : 'medium',
        category: validCategory,
        priorityScore: item.basePriority,
        nextReview: item.nextReview,
        group,
        path: filePath,
        lastReviewed,
        freshness: TechDebtService.computeFreshness(lastReviewed, item.status),
        linkedBlueprints: item.linkedBlueprints ?? [],
      }
    } catch {
      return null
    }
  }

  protected matchesAllFilters(item: TechDebtRecord, filters: TechDebtQueryFilters): boolean {
    return (
      this.matchesStatusFilter(item.status, filters.status) &&
      this.matchesSeverityFilter(item, filters) &&
      this.matchesCategoryFilter(item, filters) &&
      this.matchesOverdueFilter(item, filters) &&
      this.matchesStaleDaysFilter(item, filters)
    )
  }

  private matchesSeverityFilter(item: TechDebtRecord, filters: TechDebtQueryFilters): boolean {
    return this.matchesFilter(item.severity, filters.severity)
  }

  private matchesCategoryFilter(item: TechDebtRecord, filters: TechDebtQueryFilters): boolean {
    if (!filters.category) return true
    return item.category !== undefined && this.matchesFilter(item.category, filters.category)
  }

  private matchesOverdueFilter(item: TechDebtRecord, filters: TechDebtQueryFilters): boolean {
    if (!filters.overdue) return true
    if (!item.nextReview) return false
    const nextReviewDate = new Date(item.nextReview)
    return nextReviewDate < new Date()
  }

  private matchesStaleDaysFilter(item: TechDebtRecord, filters: TechDebtQueryFilters): boolean {
    if (filters.staleDays === undefined) return true
    if (!item.lastReviewed) return false
    const daysSinceReview = Math.floor(
      (Date.now() - item.lastReviewed.getTime()) / (1000 * 60 * 60 * 24),
    )
    return daysSinceReview >= filters.staleDays
  }

  private static readonly SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 } as const

  private static compareOptionalDates(
    a: Date | string | undefined,
    b: Date | string | undefined,
  ): number {
    if (!a && !b) return 0
    if (!a) return 1
    if (!b) return -1
    const aTime = a instanceof Date ? a.getTime() : new Date(a).getTime()
    const bTime = b instanceof Date ? b.getTime() : new Date(b).getTime()
    return aTime - bTime
  }

  private static compareField(a: TechDebtRecord, b: TechDebtRecord, field: string): number {
    switch (field) {
      case 'priorityScore':
        return a.priorityScore - b.priorityScore
      case 'nextReview':
        return TechDebtService.compareOptionalDates(a.nextReview, b.nextReview)
      case 'lastReviewed':
        return TechDebtService.compareOptionalDates(a.lastReviewed, b.lastReviewed)
      case 'slug':
        return a.slug.localeCompare(b.slug)
      case 'severity':
        return (
          (TechDebtService.SEVERITY_ORDER[a.severity] ?? 0) -
          (TechDebtService.SEVERITY_ORDER[b.severity] ?? 0)
        )
      default:
        return 0
    }
  }

  protected applySorting(items: TechDebtRecord[], sort: TechDebtSortOptions): TechDebtRecord[] {
    const sorted = [...items]
    const direction = sort.direction === 'asc' ? 1 : -1
    sorted.sort((a, b) => TechDebtService.compareField(a, b, sort.field) * direction)

    return sorted
  }

  // Compute query summary
  private computeQuerySummary(
    allItems: TechDebtRecord[],
    totalFiltered: number,
  ): TechDebtQueryResult['summary'] {
    const byStatus = this.countByField(allItems, (i) => i.status)
    const bySeverity = this.countByField(allItems, (i) => i.severity)

    const now = new Date()
    const overdueCount = allItems.filter((i) => {
      if (!i.nextReview) return false
      const nextReviewDate = new Date(i.nextReview)
      return nextReviewDate < now
    }).length

    const totalPriority = allItems.reduce((sum, i) => sum + i.priorityScore, 0)

    return {
      total: totalFiltered,
      byStatus,
      bySeverity,
      overdueCount,
      avgPriority: allItems.length > 0 ? totalPriority / allItems.length : 0,
    }
  }
}
