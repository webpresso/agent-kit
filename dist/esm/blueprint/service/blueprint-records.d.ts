import type { BlueprintQueryFilters, BlueprintQueryResult, BlueprintRecord, BlueprintSortOptions } from '#query/types';
export declare function toBlueprintRecord(filePath: string, slug: string, group: string | null): Promise<BlueprintRecord | null>;
export declare function extractTitle(raw: string): string | null;
export declare function extractFilesTouched(raw: string): string[];
export declare function matchesBlueprintFilters(plan: BlueprintRecord, filters: BlueprintQueryFilters, matchesFilter: (value: string, filter: string | string[]) => boolean): boolean;
export declare function sortBlueprintRecords(plans: BlueprintRecord[], sort: BlueprintSortOptions): BlueprintRecord[];
export declare function computeBlueprintQuerySummary(allPlans: BlueprintRecord[], totalFiltered: number, countByField: (records: BlueprintRecord[], selector: (record: BlueprintRecord) => string) => Record<string, number>, isStale: (plan: BlueprintRecord) => boolean): BlueprintQueryResult['summary'];
//# sourceMappingURL=blueprint-records.d.ts.map