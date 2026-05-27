/**
 * Blueprint DB Parser
 *
 * Extracts structured data from blueprint `_overview.md` files for DB projection.
 * This is SEPARATE from `src/blueprint/core/parser.ts` which serves the CLI/runtime layer.
 *
 * Design: fault-tolerant — malformed YAML or missing sections log to stderr and return
 * partial data rather than throwing. Callers should check required fields before ingesting.
 */
export interface CrossRepoDependency {
    repo: string;
    slug: string | null;
    requireStatus: string | null;
}
export interface ParsedTaskFile {
    filePath: string;
    op: 'create' | 'modify' | 'delete';
}
export interface ParsedTask {
    taskId: string;
    wave: string | null;
    title: string;
    status: 'todo' | 'in-progress' | 'blocked' | 'done' | 'dropped';
    description: string | null;
    acceptanceCriteria: string[];
    dependsOnTaskIds: string[];
    files: ParsedTaskFile[];
}
export interface ParsedRisk {
    riskId: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
    mitigation: string;
}
export interface ParsedEdgeCase {
    edgeId: string;
    severity: string;
    description: string;
    mitigation: string;
}
export interface ParsedBlueprintForDb {
    slug: string;
    filePath: string;
    title: string;
    status: string;
    complexity: string | null;
    owner: string | null;
    created: string | null;
    lastUpdated: string | null;
    completedAt: string | null;
    tags: string[];
    dependsOn: string[];
    crossRepoDependsOn: CrossRepoDependency[];
    organization: string;
    visibility: 'public' | 'private';
    tasks: ParsedTask[];
    risks: ParsedRisk[];
    edgeCases: ParsedEdgeCase[];
    byteSize: number;
    contentHash: string;
}
/**
 * Parse a blueprint `_overview.md` for DB projection.
 *
 * Fault-tolerant: malformed YAML or missing sections log to stderr and return
 * partial data; this function never throws.
 */
export declare function parseBlueprintForDb(content: string, filePath: string, slug: string): ParsedBlueprintForDb;
//# sourceMappingURL=blueprint-db-parser.d.ts.map