/**
 * TechDebtService
 *
 * Manages technical debt items stored in git.
 * Scans tech-debt documents recursively from the resolved repo layout.
 * Extends TrackedDocumentService to provide filtering, sorting, and query capabilities.
 */
import type { BlueprintRecord } from '#query/types';
import { type TechDebtItem, type TechDebtQueryFilters, type TechDebtQueryResult, type TechDebtRecord, type TechDebtSortOptions } from '#tech-debt/index';
import { TrackedDocumentService } from './TrackedDocumentService.js';
export interface TechDebtSummary {
    slug: string;
    title: string;
    status: string;
    severity: string;
    category?: string;
    priorityScore: number;
    nextReview?: string;
    malformed?: string;
}
export interface TechDebtQueryOptions {
    filters?: TechDebtQueryFilters;
    sort?: TechDebtSortOptions;
    limit?: number;
    offset?: number;
}
export declare class TechDebtService extends TrackedDocumentService<TechDebtSummary, TechDebtRecord, TechDebtQueryFilters, TechDebtSortOptions, TechDebtQueryResult> {
    constructor(projectPath?: string);
    list(): Promise<TechDebtSummary[]>;
    listTechDebt(): Promise<TechDebtSummary[]>;
    private tryParseTechDebtSummary;
    protected parseSummary(content: string, slug: string): TechDebtSummary;
    protected buildMalformedSummary(scanned: {
        path: string;
        slug: string;
    }, data: Record<string, unknown>, errorMessage: string): TechDebtSummary;
    get(slug: string): Promise<TechDebtItem>;
    getTechDebt(slug: string): Promise<TechDebtItem>;
    query(options?: TechDebtQueryOptions): Promise<TechDebtQueryResult>;
    /**
     * Get tech debt items that are past their review date
     */
    getOverdueReviews(): Promise<TechDebtRecord[]>;
    /**
     * Get tech debt items by category
     */
    getByCategory(category: string): Promise<TechDebtRecord[]>;
    /**
     * Get tech debt items by severity
     */
    getBySeverity(severity: string): Promise<TechDebtRecord[]>;
    /**
     * Link a tech debt item to a blueprint (bidirectional)
     * Updates both the tech debt document and blueprint frontmatter
     * @param tdSlug - TechDebt slug
     * @param bpSlug - Blueprint slug
     * @throws Error if either document doesn't exist
     */
    linkToBlueprint(tdSlug: string, bpSlug: string): Promise<void>;
    /**
     * Unlink a tech debt item from a blueprint (bidirectional)
     * Updates both the tech debt document and blueprint frontmatter
     * @param tdSlug - TechDebt slug
     * @param bpSlug - Blueprint slug
     */
    unlinkFromBlueprint(tdSlug: string, bpSlug: string): Promise<void>;
    /**
     * Get all blueprints linked to a tech debt item
     * @param tdSlug - TechDebt slug
     * @returns Array of BlueprintRecord objects
     */
    getLinkedBlueprints(tdSlug: string): Promise<import('../query/types.js').BlueprintRecord[]>;
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
    computePriorityScore(item: TechDebtRecord, linkedBlueprints: BlueprintRecord[]): number;
    private static readonly FRESHNESS_STATUS_MAP;
    private static computeFreshness;
    protected toRecord(filePath: string, slug: string, group: string | null): Promise<TechDebtRecord | null>;
    protected matchesAllFilters(item: TechDebtRecord, filters: TechDebtQueryFilters): boolean;
    private matchesSeverityFilter;
    private matchesCategoryFilter;
    private matchesOverdueFilter;
    private matchesStaleDaysFilter;
    private static readonly SEVERITY_ORDER;
    private static compareOptionalDates;
    private static compareField;
    protected applySorting(items: TechDebtRecord[], sort: TechDebtSortOptions): TechDebtRecord[];
    private computeQuerySummary;
}
//# sourceMappingURL=TechDebtService.d.ts.map