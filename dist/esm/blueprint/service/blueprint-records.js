import * as fs from 'node:fs/promises';
import { parseBlueprint } from '#core/parser';
import { isBlueprintStatus, isComplexity } from '#query/types';
import { calculateFreshness } from '#utils/freshness';
export async function toBlueprintRecord(filePath, slug, group) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const plan = parseBlueprint(content, slug);
        const planStatus = isBlueprintStatus(plan.status) ? plan.status : 'draft';
        const lastUpdated = plan.lastUpdated ? new Date(plan.lastUpdated) : new Date();
        const freshness = calculateFreshness(lastUpdated, planStatus);
        const tasksCompleted = plan.tasks.filter((task) => task.status === 'done').length;
        return {
            name: slug,
            title: extractTitle(plan.raw) ?? slug,
            status: planStatus,
            complexity: isComplexity(plan.complexity) ? plan.complexity : undefined,
            taskCount: plan.tasks.length,
            tasksCompleted,
            group,
            path: filePath,
            lastUpdated,
            freshness,
            filesTouched: extractFilesTouched(plan.raw),
        };
    }
    catch {
        return null;
    }
}
export function extractTitle(raw) {
    const match = raw.match(/^#\s+(.+)$/m);
    return match?.[1]?.trim() ?? null;
}
export function extractFilesTouched(raw) {
    const filesSection = raw.match(/\*\*Files:\*\*\s*([\s\S]*?)(?=\n\*\*|\n###|\n####|$)/gi);
    if (!filesSection)
        return [];
    const allPaths = filesSection.flatMap((section) => extractPathsFromSection(section));
    return [...new Set(allPaths)];
}
function extractPathsFromSection(section) {
    const pathMatches = section.match(/[`-]\s*`?([^`\n]+\.[a-z]+)`?/gi);
    if (!pathMatches)
        return [];
    return pathMatches
        .map((match) => match
        .replace(/^[`-]\s*`?/, '')
        .replace(/`$/, '')
        .trim())
        .filter((path) => path.length > 0);
}
export function matchesBlueprintFilters(plan, filters, matchesFilter) {
    return (matchesStatusFilter(plan, filters, matchesFilter) &&
        matchesGroupFilter(plan, filters, matchesFilter) &&
        matchesComplexityFilter(plan, filters, matchesFilter) &&
        matchesStaleFilter(plan, filters) &&
        matchesFilesTouchedFilter(plan, filters));
}
function matchesStatusFilter(plan, filters, matchesFilter) {
    if (!filters.status)
        return true;
    return matchesFilter(plan.status, filters.status);
}
function matchesGroupFilter(plan, filters, matchesFilter) {
    if (!filters.group)
        return true;
    return plan.group !== null && matchesFilter(plan.group, filters.group);
}
function matchesComplexityFilter(plan, filters, matchesFilter) {
    if (!filters.complexity)
        return true;
    return plan.complexity !== undefined && matchesFilter(plan.complexity, filters.complexity);
}
function matchesStaleFilter(plan, filters) {
    if (!filters.stale)
        return true;
    return plan.freshness.status === 'stale' || plan.freshness.status === 'critical';
}
function matchesFilesTouchedFilter(plan, filters) {
    if (!filters.filesTouched || !filters.filesTouched.length)
        return true;
    return filters.filesTouched.some((file) => plan.filesTouched.includes(file));
}
export function sortBlueprintRecords(plans, sort) {
    const sorted = [...plans];
    const direction = sort.direction === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
        let comparison = 0;
        switch (sort.field) {
            case 'freshness':
                comparison = a.freshness.score - b.freshness.score;
                break;
            case 'lastUpdated':
                comparison = a.lastUpdated.getTime() - b.lastUpdated.getTime();
                break;
            case 'taskCount':
                comparison = a.taskCount - b.taskCount;
                break;
            case 'name':
                comparison = a.name.localeCompare(b.name);
                break;
            case 'status':
                comparison = a.status.localeCompare(b.status);
                break;
        }
        return comparison * direction;
    });
    return sorted;
}
export function computeBlueprintQuerySummary(allPlans, totalFiltered, countByField, isStale) {
    const byStatus = countByField(allPlans, (plan) => plan.status);
    const byGroup = countByField(allPlans.filter((plan) => plan.group !== null), (plan) => plan.group);
    const staleCount = allPlans.filter((plan) => isStale(plan)).length;
    const totalFreshness = allPlans.reduce((sum, plan) => sum + plan.freshness.score, 0);
    return {
        total: totalFiltered,
        byStatus,
        byGroup,
        staleCount,
        avgFreshness: allPlans.length > 0 ? totalFreshness / allPlans.length : 1.0,
    };
}
//# sourceMappingURL=blueprint-records.js.map