/**
 * Plan Service
 *
 * Manages implementation plans stored in git.
 * Scans resolved blueprint roots recursively for _overview.md files.
 */
import type { BlueprintLifecycleIntent } from '#lifecycle/engine';
import type { BlueprintQueryFilters, BlueprintQueryResult, BlueprintRecord, BlueprintSortOptions } from '#query/types';
import type { TechDebtRecord } from '#tech-debt/index';
import { type Blueprint } from '#core/parser';
import { TrackedDocumentService } from './TrackedDocumentService.js';
export interface BlueprintSummary {
    name: string;
    title: string;
    status: string;
    complexity: string;
    taskCount: number;
    progress: number;
    type: 'blueprint' | 'parent-roadmap';
    parentRoadmap?: string;
    malformed?: string;
}
export interface BlueprintQueryOptions {
    filters?: BlueprintQueryFilters;
    sort?: BlueprintSortOptions;
    limit?: number;
    offset?: number;
}
export declare class BlueprintService extends TrackedDocumentService<BlueprintSummary, BlueprintRecord, BlueprintQueryFilters, BlueprintSortOptions, BlueprintQueryResult> {
    constructor(projectPath?: string);
    list(): Promise<BlueprintSummary[]>;
    private tryParseBlueprintSummary;
    protected parseSummary(content: string, slug: string): BlueprintSummary;
    protected buildMalformedSummary(scanned: {
        path: string;
        slug: string;
    }, data: Record<string, unknown>, errorMessage: string): BlueprintSummary;
    get(slug: string): Promise<Blueprint>;
    query(options?: BlueprintQueryOptions): Promise<BlueprintQueryResult>;
    getStalePlans(thresholdDays?: number): Promise<BlueprintRecord[]>;
    getByGroup(group: string): Promise<BlueprintRecord[]>;
    protected toRecord(filePath: string, slug: string, group: string | null): Promise<BlueprintRecord | null>;
    protected matchesAllFilters(plan: BlueprintRecord, filters: BlueprintQueryFilters): boolean;
    protected applySorting(plans: BlueprintRecord[], sort: BlueprintSortOptions): BlueprintRecord[];
    private computeQuerySummary;
    /**
     * Link a blueprint to a tech debt item (bidirectional)
     * Updates both the blueprint document and tech debt frontmatter
     * @param bpSlug - Blueprint slug
     * @param tdSlug - TechDebt slug
     * @throws Error if blueprint doesn't exist
     */
    linkToTechDebt(bpSlug: string, tdSlug: string): Promise<void>;
    /**
     * Unlink a blueprint from a tech debt item (bidirectional)
     * Updates both the blueprint document and tech debt frontmatter
     * @param bpSlug - Blueprint slug
     * @param tdSlug - TechDebt slug
     */
    unlinkFromTechDebt(bpSlug: string, tdSlug: string): Promise<void>;
    /**
     * Get all tech debt items linked to a blueprint
     * @param bpSlug - Blueprint slug
     * @returns Array of TechDebtRecord objects
     */
    getLinkedTechDebt(bpSlug: string): Promise<TechDebtRecord[]>;
    moveBlueprint(slug: string, targetStatus: string): Promise<void>;
    updateBlueprintStatus(slug: string, intent: BlueprintLifecycleIntent): Promise<void>;
}
//# sourceMappingURL=BlueprintService.d.ts.map