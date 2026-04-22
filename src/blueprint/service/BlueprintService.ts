/**
 * Plan Service
 *
 * Manages implementation plans stored in git.
 * Scans webpresso/blueprints recursively for _overview.md files.
 */

import type { BlueprintLifecycleIntent } from '#lifecycle/engine'
import type {
  BlueprintQueryFilters,
  BlueprintQueryResult,
  BlueprintRecord,
  BlueprintSortOptions,
} from '#query/types'
import type { TechDebtRecord } from '#tech-debt/index'

import matter from 'gray-matter'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { type Blueprint, parseBlueprint } from '#core/parser'
import { applyBlueprintLifecycleToFile } from '#lifecycle/local'
import { resolveBlueprintRoot } from '#utils/blueprint-root'
import { emitTraceArtifact, generateBlueprintLifecycleTrace } from '#utils/decision-trace-artifacts'
import { BlueprintNotFoundError } from '#utils/errors'

import {
  computeBlueprintQuerySummary,
  matchesBlueprintFilters,
  sortBlueprintRecords,
  toBlueprintRecord,
} from './blueprint-records.js'
import {
  linkBlueprintToTechDebt,
  unlinkBlueprintFromTechDebt,
} from './blueprint-tech-debt-links.js'
import { scanBlueprintDirectory } from './scanner.js'
import { TechDebtService } from './TechDebtService.js'
import { TrackedDocumentService } from './TrackedDocumentService.js'

export interface BlueprintSummary {
  name: string
  title: string
  status: string
  complexity: string
  taskCount: number
  progress: number
  malformed?: string
}

export interface BlueprintQueryOptions {
  filters?: BlueprintQueryFilters
  sort?: BlueprintSortOptions
  limit?: number
  offset?: number
}

export class BlueprintService extends TrackedDocumentService<
  BlueprintSummary,
  BlueprintRecord,
  BlueprintQueryFilters,
  BlueprintSortOptions,
  BlueprintQueryResult
> {
  constructor(projectPath?: string) {
    // If projectPath is provided, use it; otherwise let scanner find monorepo root.
    // Prefers `webpresso/blueprints/` when present (webpresso legacy),
    // falls back to `blueprints/` for generic consumers.
    const plansDir = resolveBlueprintRoot(projectPath)
    super(plansDir, '_overview.md', projectPath)
  }

  async list(): Promise<BlueprintSummary[]> {
    const scannedPlans = scanBlueprintDirectory({
      baseDir: this.baseDir,
      includeSpecialFolders: true,
    })

    const plans: BlueprintSummary[] = []
    for (const scanned of scannedPlans) {
      const summary = await this.tryParseBlueprintSummary(scanned)
      if (summary) {
        plans.push(summary)
      }
    }
    return plans
  }

  private async tryParseBlueprintSummary(scanned: {
    path: string
    slug: string
  }): Promise<BlueprintSummary | null> {
    try {
      const content = await fs.readFile(scanned.path, 'utf-8')
      const { data } = matter(content)

      // Skip parent roadmaps - only include implementation plans
      if (data.type === 'parent-roadmap') {
        return null
      }

      return this.parseSummary(content, scanned.slug)
    } catch (error) {
      return this.handleParseSummaryError(error, scanned)
    }
  }

  protected parseSummary(content: string, slug: string): BlueprintSummary {
    const plan = parseBlueprint(content, slug)
    const doneCount = plan.tasks.filter((t) => t.status === 'done').length
    return {
      name: plan.name,
      title: plan.title,
      status: plan.status,
      complexity: plan.complexity,
      taskCount: plan.tasks.length,
      progress: plan.tasks.length > 0 ? Math.round((doneCount / plan.tasks.length) * 100) : 0,
    }
  }

  protected buildMalformedSummary(
    scanned: { path: string; slug: string },
    data: Record<string, unknown>,
    errorMessage: string,
  ): BlueprintSummary {
    return {
      name: scanned.slug,
      title: scanned.slug,
      status: (data.status as string) || 'unknown',
      complexity: (data.complexity as string) || 'unknown',
      taskCount: 0,
      progress: 0,
      malformed: errorMessage,
    }
  }

  async get(slug: string): Promise<Blueprint> {
    // Try direct path first (supports both 'in-progress/foo' and 'foo')
    const planPath = path.join(this.baseDir, slug, '_overview.md')
    try {
      await fs.access(planPath)
      const content = await fs.readFile(planPath, 'utf-8')
      return parseBlueprint(content, slug)
    } catch {
      // Scan all plans to find a match by slug
      const scannedPlans = scanBlueprintDirectory({
        baseDir: this.baseDir,
        includeSpecialFolders: true,
      })

      const found = scannedPlans.find((p) => p.slug === slug || p.slug.endsWith(`/${slug}`))
      if (!found) {
        throw new BlueprintNotFoundError(
          slug,
          planPath,
          scannedPlans.map((p) => p.slug),
        )
      }

      const content = await fs.readFile(found.path, 'utf-8')
      return parseBlueprint(content, found.slug)
    }
  }

  async query(options?: BlueprintQueryOptions): Promise<BlueprintQueryResult> {
    const scannedPlans = scanBlueprintDirectory({ baseDir: this.baseDir })
    const planRecords = await this.buildRecords(scannedPlans)

    const { records, totalFiltered } = this.processQueryPipeline(planRecords, options)

    return {
      plans: records,
      summary: this.computeQuerySummary(planRecords, totalFiltered),
    }
  }

  async getStalePlans(thresholdDays?: number): Promise<BlueprintRecord[]> {
    const result = await this.query({
      filters: { stale: true, staleDays: thresholdDays },
    })
    return result.plans
  }

  async getByGroup(group: string): Promise<BlueprintRecord[]> {
    const result = await this.query({
      filters: { group },
    })
    return result.plans
  }

  protected async toRecord(
    filePath: string,
    slug: string,
    group: string | null,
  ): Promise<BlueprintRecord | null> {
    return toBlueprintRecord(filePath, slug, group)
  }

  protected matchesAllFilters(plan: BlueprintRecord, filters: BlueprintQueryFilters): boolean {
    return matchesBlueprintFilters(plan, filters, (value, filter) =>
      this.matchesFilter(value, filter),
    )
  }

  protected applySorting(plans: BlueprintRecord[], sort: BlueprintSortOptions): BlueprintRecord[] {
    return sortBlueprintRecords(plans, sort)
  }

  // Compute query summary (different from list summary)
  private computeQuerySummary(
    allPlans: BlueprintRecord[],
    totalFiltered: number,
  ): BlueprintQueryResult['summary'] {
    return computeBlueprintQuerySummary(
      allPlans,
      totalFiltered,
      (records: BlueprintRecord[], selector: (record: BlueprintRecord) => string) =>
        this.countByField(records, selector),
      (plan) => this.isStale(plan),
    )
  }

  /**
   * Link a blueprint to a tech debt item (bidirectional)
   * Updates both the blueprint document and tech debt frontmatter
   * @param bpSlug - Blueprint slug
   * @param tdSlug - TechDebt slug
   * @throws Error if blueprint doesn't exist
   */
  async linkToTechDebt(bpSlug: string, tdSlug: string): Promise<void> {
    await linkBlueprintToTechDebt(this.baseDir, this.projectPath, bpSlug, tdSlug)
  }

  /**
   * Unlink a blueprint from a tech debt item (bidirectional)
   * Updates both the blueprint document and tech debt frontmatter
   * @param bpSlug - Blueprint slug
   * @param tdSlug - TechDebt slug
   */
  async unlinkFromTechDebt(bpSlug: string, tdSlug: string): Promise<void> {
    await unlinkBlueprintFromTechDebt(this.baseDir, this.projectPath, bpSlug, tdSlug)
  }

  /**
   * Get all tech debt items linked to a blueprint
   * @param bpSlug - Blueprint slug
   * @returns Array of TechDebtRecord objects
   */
  async getLinkedTechDebt(bpSlug: string): Promise<TechDebtRecord[]> {
    const blueprintPath = path.join(this.baseDir, bpSlug, '_overview.md')
    const content = await fs.readFile(blueprintPath, 'utf-8')
    const parsed = matter(content)
    const data = JSON.parse(JSON.stringify(parsed.data)) as Record<string, unknown>
    const linkedTechDebtSlugs = (data.linked_tech_debt_slugs as string[]) ?? []

    if (!linkedTechDebtSlugs.length) {
      return []
    }

    const techDebtService = new TechDebtService(this.projectPath)
    const allTechDebt = await techDebtService.query()
    return allTechDebt.items.filter((techDebt) => linkedTechDebtSlugs.includes(techDebt.slug))
  }

  async moveBlueprint(slug: string, targetStatus: string): Promise<void> {
    const projectRoot = this.projectPath ?? process.cwd()
    const intent: BlueprintLifecycleIntent =
      targetStatus === 'completed' ? { type: 'finalize' } : { type: 'start' }
    const result = await applyBlueprintLifecycleToFile(projectRoot, slug, intent)

    const trace = generateBlueprintLifecycleTrace(projectRoot, slug, 'move', {
      from: slug,
      to: `${result.targetStatus}/${slug}`,
      moved: result.moved,
    })
    emitTraceArtifact(projectRoot, trace)
  }

  async updateBlueprintStatus(slug: string, intent: BlueprintLifecycleIntent): Promise<void> {
    const projectRoot = this.projectPath ?? process.cwd()
    const result = await applyBlueprintLifecycleToFile(projectRoot, slug, intent)

    const trace = generateBlueprintLifecycleTrace(projectRoot, slug, 'status_change', {
      intent: intent.type,
      targetStatus: result.targetStatus,
      moved: result.moved,
    })
    emitTraceArtifact(projectRoot, trace)
  }
}
