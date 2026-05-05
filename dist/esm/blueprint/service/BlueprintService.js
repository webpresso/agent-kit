/**
 * Plan Service
 *
 * Manages implementation plans stored in git.
 * Scans resolved blueprint roots recursively for _overview.md files.
 */
import matter from 'gray-matter';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseBlueprint } from '#core/parser';
import { applyBlueprintLifecycleToFile } from '#lifecycle/local';
import { resolveBlueprintRoot } from '#utils/blueprint-root';
import { emitTraceArtifact, generateBlueprintLifecycleTrace } from '#utils/decision-trace-artifacts';
import { BlueprintNotFoundError } from '#utils/errors';
import { computeBlueprintQuerySummary, matchesBlueprintFilters, sortBlueprintRecords, toBlueprintRecord, } from './blueprint-records.js';
import { linkBlueprintToTechDebt, unlinkBlueprintFromTechDebt, } from './blueprint-tech-debt-links.js';
import { scanBlueprintDirectory } from './scanner.js';
import { TechDebtService } from './TechDebtService.js';
import { TrackedDocumentService } from './TrackedDocumentService.js';
export class BlueprintService extends TrackedDocumentService {
    constructor(projectPath) {
        // Resolve generic consumer layout first, with Webpresso's legacy layout as fallback.
        const plansDir = resolveBlueprintRoot(projectPath);
        super(plansDir, '_overview.md', projectPath);
    }
    async list() {
        const scannedPlans = scanBlueprintDirectory({
            baseDir: this.baseDir,
            includeSpecialFolders: true,
        });
        const plans = [];
        for (const scanned of scannedPlans) {
            const summary = await this.tryParseBlueprintSummary(scanned);
            if (summary) {
                plans.push(summary);
            }
        }
        return plans;
    }
    async tryParseBlueprintSummary(scanned) {
        try {
            const content = await fs.readFile(scanned.path, 'utf-8');
            return this.parseSummary(content, scanned.slug);
        }
        catch (error) {
            return this.handleParseSummaryError(error, scanned);
        }
    }
    parseSummary(content, slug) {
        const plan = parseBlueprint(content, slug);
        const doneCount = plan.tasks.filter((t) => t.status === 'done').length;
        return {
            name: plan.name,
            title: plan.title,
            status: plan.status,
            complexity: plan.complexity,
            taskCount: plan.tasks.length,
            progress: plan.tasks.length > 0 ? Math.round((doneCount / plan.tasks.length) * 100) : 0,
            type: plan.type,
        };
    }
    buildMalformedSummary(scanned, data, errorMessage) {
        return {
            name: scanned.slug,
            title: scanned.slug,
            status: data.status || 'unknown',
            complexity: data.complexity || 'unknown',
            taskCount: 0,
            progress: 0,
            type: data.type === 'parent-roadmap' ? 'parent-roadmap' : 'blueprint',
            malformed: errorMessage,
        };
    }
    async get(slug) {
        // Try direct path first (supports both 'in-progress/foo' and 'foo')
        const planPath = path.join(this.baseDir, slug, '_overview.md');
        try {
            await fs.access(planPath);
            const content = await fs.readFile(planPath, 'utf-8');
            return parseBlueprint(content, slug);
        }
        catch {
            // Scan all plans to find a match by slug
            const scannedPlans = scanBlueprintDirectory({
                baseDir: this.baseDir,
                includeSpecialFolders: true,
            });
            const found = scannedPlans.find((p) => p.slug === slug || p.slug.endsWith(`/${slug}`));
            if (!found) {
                throw new BlueprintNotFoundError(slug, planPath, scannedPlans.map((p) => p.slug));
            }
            const content = await fs.readFile(found.path, 'utf-8');
            return parseBlueprint(content, found.slug);
        }
    }
    async query(options) {
        const scannedPlans = scanBlueprintDirectory({ baseDir: this.baseDir });
        const planRecords = await this.buildRecords(scannedPlans);
        const { records, totalFiltered } = this.processQueryPipeline(planRecords, options);
        return {
            plans: records,
            summary: this.computeQuerySummary(planRecords, totalFiltered),
        };
    }
    async getStalePlans(thresholdDays) {
        const result = await this.query({
            filters: { stale: true, staleDays: thresholdDays },
        });
        return result.plans;
    }
    async getByGroup(group) {
        const result = await this.query({
            filters: { group },
        });
        return result.plans;
    }
    async toRecord(filePath, slug, group) {
        return toBlueprintRecord(filePath, slug, group);
    }
    matchesAllFilters(plan, filters) {
        return matchesBlueprintFilters(plan, filters, (value, filter) => this.matchesFilter(value, filter));
    }
    applySorting(plans, sort) {
        return sortBlueprintRecords(plans, sort);
    }
    // Compute query summary (different from list summary)
    computeQuerySummary(allPlans, totalFiltered) {
        return computeBlueprintQuerySummary(allPlans, totalFiltered, (records, selector) => this.countByField(records, selector), (plan) => this.isStale(plan));
    }
    /**
     * Link a blueprint to a tech debt item (bidirectional)
     * Updates both the blueprint document and tech debt frontmatter
     * @param bpSlug - Blueprint slug
     * @param tdSlug - TechDebt slug
     * @throws Error if blueprint doesn't exist
     */
    async linkToTechDebt(bpSlug, tdSlug) {
        await linkBlueprintToTechDebt(this.baseDir, this.projectPath, bpSlug, tdSlug);
    }
    /**
     * Unlink a blueprint from a tech debt item (bidirectional)
     * Updates both the blueprint document and tech debt frontmatter
     * @param bpSlug - Blueprint slug
     * @param tdSlug - TechDebt slug
     */
    async unlinkFromTechDebt(bpSlug, tdSlug) {
        await unlinkBlueprintFromTechDebt(this.baseDir, this.projectPath, bpSlug, tdSlug);
    }
    /**
     * Get all tech debt items linked to a blueprint
     * @param bpSlug - Blueprint slug
     * @returns Array of TechDebtRecord objects
     */
    async getLinkedTechDebt(bpSlug) {
        const blueprintPath = path.join(this.baseDir, bpSlug, '_overview.md');
        const content = await fs.readFile(blueprintPath, 'utf-8');
        const parsed = matter(content);
        const data = JSON.parse(JSON.stringify(parsed.data));
        const linkedTechDebtSlugs = data.linked_tech_debt_slugs ?? [];
        if (!linkedTechDebtSlugs.length) {
            return [];
        }
        const techDebtService = new TechDebtService(this.projectPath);
        const allTechDebt = await techDebtService.query();
        return allTechDebt.items.filter((techDebt) => linkedTechDebtSlugs.includes(techDebt.slug));
    }
    async moveBlueprint(slug, targetStatus) {
        const projectRoot = this.projectPath ?? process.cwd();
        const intent = targetStatus === 'completed' ? { type: 'finalize' } : { type: 'start' };
        const result = await applyBlueprintLifecycleToFile(projectRoot, slug, intent);
        const trace = generateBlueprintLifecycleTrace(slug, 'move', {
            from: slug,
            to: `${result.targetStatus}/${slug}`,
            moved: result.moved,
        });
        emitTraceArtifact(projectRoot, trace);
    }
    async updateBlueprintStatus(slug, intent) {
        const projectRoot = this.projectPath ?? process.cwd();
        const result = await applyBlueprintLifecycleToFile(projectRoot, slug, intent);
        const trace = generateBlueprintLifecycleTrace(slug, 'status_change', {
            intent: intent.type,
            targetStatus: result.targetStatus,
            moved: result.moved,
        });
        emitTraceArtifact(projectRoot, trace);
    }
}
//# sourceMappingURL=BlueprintService.js.map