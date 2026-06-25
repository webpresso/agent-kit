/**
 * TechDebtService
 *
 * Manages technical debt items stored in git.
 * Scans tech-debt documents recursively from the resolved repo layout.
 * Extends TrackedDocumentService to provide filtering, sorting, and query capabilities.
 */
import matter from "gray-matter";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isCategory, isSeverity, isTechDebtStatus, parseTechDebt, } from "#tech-debt/index";
import { resolveBlueprintRoot } from "#utils/blueprint-root";
import { resolveTechDebtRoot } from "#utils/tech-debt-root";
import { calculateFreshness } from "#utils/freshness";
import { toBlueprintRecord } from "./blueprint-records.js";
import { linkBlueprintToTechDebt, unlinkBlueprintFromTechDebt, } from "./blueprint-tech-debt-links.js";
import { computePriorityScore as computePriorityScoreAlgorithm } from "./priority-scoring.js";
import { scanBlueprintDirectory, scanDocumentDirectory } from "./scanner.js";
import { TrackedDocumentService } from "./TrackedDocumentService.js";
export class TechDebtService extends TrackedDocumentService {
    constructor(projectPath) {
        // Resolve generic consumer layout first, with Webpresso's legacy layout as fallback.
        const techDebtDir = resolveTechDebtRoot(projectPath);
        super(techDebtDir, "README.md", projectPath);
    }
    // Implementation of abstract list() method
    list() {
        return this.listTechDebt();
    }
    async listTechDebt() {
        const scannedItems = scanDocumentDirectory({
            baseDir: this.baseDir,
            filePattern: this.filePattern,
            includeSpecialFolders: true,
        });
        const items = [];
        for (const scanned of scannedItems) {
            const summary = await this.tryParseTechDebtSummary(scanned);
            if (summary) {
                items.push(summary);
            }
        }
        return items;
    }
    async tryParseTechDebtSummary(scanned) {
        try {
            const content = await fs.readFile(scanned.path, "utf-8");
            return this.parseSummary(content, scanned.slug);
        }
        catch (error) {
            return this.handleParseSummaryError(error, scanned);
        }
    }
    parseSummary(content, slug) {
        const item = parseTechDebt(content, slug);
        return {
            slug: item.slug,
            title: item.title,
            status: item.status,
            severity: item.severity,
            category: item.category,
            priorityScore: item.basePriority,
            nextReview: item.nextReview,
        };
    }
    buildMalformedSummary(scanned, data, errorMessage) {
        return {
            slug: scanned.slug,
            title: data.title || scanned.slug,
            status: data.status || "unknown",
            severity: data.severity || "unknown",
            category: data.category,
            priorityScore: 0,
            malformed: errorMessage,
        };
    }
    // Implementation of abstract get() method
    get(slug) {
        return this.getTechDebt(slug);
    }
    async getTechDebt(slug) {
        // Try direct path first (supports both 'category/item' and 'item')
        const itemPath = path.join(this.baseDir, slug, "README.md");
        try {
            await fs.access(itemPath);
            const content = await fs.readFile(itemPath, "utf-8");
            return parseTechDebt(content, slug);
        }
        catch {
            // Scan all items to find a match by slug
            const scannedItems = scanDocumentDirectory({
                baseDir: this.baseDir,
                filePattern: this.filePattern,
                includeSpecialFolders: true,
            });
            const found = scannedItems.find((p) => p.slug === slug || p.slug.endsWith(`/${slug}`));
            if (!found) {
                throw new Error(`TechDebt item not found: ${slug}\nAvailable items:\n${scannedItems.map((p) => `  - ${p.slug}`).join("\n")}`);
            }
            const content = await fs.readFile(found.path, "utf-8");
            return parseTechDebt(content, found.slug);
        }
    }
    async query(options) {
        const scannedItems = scanDocumentDirectory({
            baseDir: this.baseDir,
            filePattern: this.filePattern,
        });
        const itemRecords = await this.buildRecords(scannedItems);
        const { records, totalFiltered } = this.processQueryPipeline(itemRecords, options);
        return {
            items: records,
            summary: this.computeQuerySummary(itemRecords, totalFiltered),
        };
    }
    /**
     * Get tech debt items that are past their review date
     */
    async getOverdueReviews() {
        const result = await this.query({
            filters: { overdue: true },
        });
        return result.items;
    }
    /**
     * Get tech debt items by category
     */
    async getByCategory(category) {
        if (!isCategory(category)) {
            throw new Error(`Invalid category: ${category}`);
        }
        const result = await this.query({
            filters: { category },
        });
        return result.items;
    }
    /**
     * Get tech debt items by severity
     */
    async getBySeverity(severity) {
        if (!isSeverity(severity)) {
            throw new Error(`Invalid severity: ${severity}`);
        }
        const result = await this.query({
            filters: { severity },
        });
        return result.items;
    }
    /**
     * Link a tech debt item to a blueprint (bidirectional)
     * Updates both the tech debt document and blueprint frontmatter
     * @param tdSlug - TechDebt slug
     * @param bpSlug - Blueprint slug
     * @throws Error if either document doesn't exist
     */
    async linkToBlueprint(tdSlug, bpSlug) {
        // Verify both documents exist
        const itemPath = path.join(this.baseDir, tdSlug, "README.md");
        await fs.access(itemPath); // Throws if tech debt not found
        await linkBlueprintToTechDebt(resolveBlueprintRoot(this.projectPath), this.projectPath, bpSlug, tdSlug);
    }
    /**
     * Unlink a tech debt item from a blueprint (bidirectional)
     * Updates both the tech debt document and blueprint frontmatter
     * @param tdSlug - TechDebt slug
     * @param bpSlug - Blueprint slug
     */
    async unlinkFromBlueprint(tdSlug, bpSlug) {
        await unlinkBlueprintFromTechDebt(resolveBlueprintRoot(this.projectPath), this.projectPath, bpSlug, tdSlug);
    }
    /**
     * Get all blueprints linked to a tech debt item
     * @param tdSlug - TechDebt slug
     * @returns Array of BlueprintRecord objects
     */
    async getLinkedBlueprints(tdSlug) {
        // Read fresh from disk and deep-clone to avoid gray-matter shared state issues
        const itemPath = path.join(this.baseDir, tdSlug, "README.md");
        const content = await fs.readFile(itemPath, "utf-8");
        const parsed = matter(content);
        const data = JSON.parse(JSON.stringify(parsed.data));
        const linkedBlueprints = data.linked_blueprints ?? [];
        if (!linkedBlueprints.length) {
            return [];
        }
        const blueprintsDir = resolveBlueprintRoot(this.projectPath);
        const scannedBlueprints = scanBlueprintDirectory({
            baseDir: blueprintsDir,
            includeSpecialFolders: true,
        });
        const matchingBlueprints = scannedBlueprints.filter((blueprint) => linkedBlueprints.includes(blueprint.slug) ||
            linkedBlueprints.some((linked) => blueprint.slug.endsWith(`/${linked}`)));
        const records = await Promise.all(matchingBlueprints.map((blueprint) => toBlueprintRecord(blueprint.path, blueprint.slug, blueprint.group)));
        return records.filter((record) => record !== null);
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
    computePriorityScore(item, linkedBlueprints) {
        return computePriorityScoreAlgorithm(item, linkedBlueprints);
    }
    static FRESHNESS_STATUS_MAP = {
        accepted: "planned",
        "needs-remediation": "in-progress",
        monitoring: "planned",
        resolved: "completed",
    };
    static computeFreshness(lastReviewed, status) {
        const freshnessStatus = TechDebtService.FRESHNESS_STATUS_MAP[status] ?? "in-progress";
        return lastReviewed
            ? calculateFreshness(lastReviewed, freshnessStatus)
            : { score: 0.5, daysSinceUpdate: 0, status: "aging" };
    }
    async toRecord(filePath, slug, group) {
        try {
            const content = await fs.readFile(filePath, "utf-8");
            const item = parseTechDebt(content, slug);
            const lastReviewed = item.lastReviewed ? new Date(item.lastReviewed) : undefined;
            const validCategory = item.category && isCategory(item.category) ? item.category : undefined;
            return {
                slug,
                title: item.title,
                status: isTechDebtStatus(item.status) ? item.status : "needs-remediation",
                severity: isSeverity(item.severity) ? item.severity : "medium",
                category: validCategory,
                priorityScore: item.basePriority,
                nextReview: item.nextReview,
                group,
                path: filePath,
                lastReviewed,
                freshness: TechDebtService.computeFreshness(lastReviewed, item.status),
                linkedBlueprints: item.linkedBlueprints ?? [],
            };
        }
        catch {
            return null;
        }
    }
    matchesAllFilters(item, filters) {
        return (this.matchesStatusFilter(item.status, filters.status) &&
            this.matchesSeverityFilter(item, filters) &&
            this.matchesCategoryFilter(item, filters) &&
            this.matchesOverdueFilter(item, filters) &&
            this.matchesStaleDaysFilter(item, filters));
    }
    matchesSeverityFilter(item, filters) {
        return this.matchesFilter(item.severity, filters.severity);
    }
    matchesCategoryFilter(item, filters) {
        if (!filters.category)
            return true;
        return item.category !== undefined && this.matchesFilter(item.category, filters.category);
    }
    matchesOverdueFilter(item, filters) {
        if (!filters.overdue)
            return true;
        if (!item.nextReview)
            return false;
        const nextReviewDate = new Date(item.nextReview);
        return nextReviewDate < new Date();
    }
    matchesStaleDaysFilter(item, filters) {
        if (filters.staleDays === undefined)
            return true;
        if (!item.lastReviewed)
            return false;
        const daysSinceReview = Math.floor((Date.now() - item.lastReviewed.getTime()) / (1000 * 60 * 60 * 24));
        return daysSinceReview >= filters.staleDays;
    }
    static SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 };
    static compareOptionalDates(a, b) {
        if (!a && !b)
            return 0;
        if (!a)
            return 1;
        if (!b)
            return -1;
        const aTime = a instanceof Date ? a.getTime() : new Date(a).getTime();
        const bTime = b instanceof Date ? b.getTime() : new Date(b).getTime();
        return aTime - bTime;
    }
    static compareField(a, b, field) {
        switch (field) {
            case "priorityScore":
                return a.priorityScore - b.priorityScore;
            case "nextReview":
                return TechDebtService.compareOptionalDates(a.nextReview, b.nextReview);
            case "lastReviewed":
                return TechDebtService.compareOptionalDates(a.lastReviewed, b.lastReviewed);
            case "slug":
                return a.slug.localeCompare(b.slug);
            case "severity":
                return ((TechDebtService.SEVERITY_ORDER[a.severity] ?? 0) -
                    (TechDebtService.SEVERITY_ORDER[b.severity] ?? 0));
            default:
                return 0;
        }
    }
    applySorting(items, sort) {
        const sorted = [...items];
        const direction = sort.direction === "asc" ? 1 : -1;
        sorted.sort((a, b) => TechDebtService.compareField(a, b, sort.field) * direction);
        return sorted;
    }
    // Compute query summary
    computeQuerySummary(allItems, totalFiltered) {
        const byStatus = this.countByField(allItems, (i) => i.status);
        const bySeverity = this.countByField(allItems, (i) => i.severity);
        const now = new Date();
        const overdueCount = allItems.filter((i) => {
            if (!i.nextReview)
                return false;
            const nextReviewDate = new Date(i.nextReview);
            return nextReviewDate < now;
        }).length;
        const totalPriority = allItems.reduce((sum, i) => sum + i.priorityScore, 0);
        return {
            total: totalFiltered,
            byStatus,
            bySeverity,
            overdueCount,
            avgPriority: allItems.length > 0 ? totalPriority / allItems.length : 0,
        };
    }
}
//# sourceMappingURL=TechDebtService.js.map