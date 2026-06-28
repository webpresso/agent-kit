import { type RotationLogEntry } from "./directives.js";
import { type ProvenanceMap } from "./provenance.js";
export interface MergeOptions {
    readonly layers: readonly string[];
    readonly directivesPath?: string;
    readonly outPath: string;
    readonly dryRun?: boolean;
    readonly cwd?: string;
}
export interface MergeResult {
    readonly content: string;
    readonly provenance: ProvenanceMap;
    readonly rotationLog: readonly RotationLogEntry[];
    readonly warnings: readonly string[];
}
export declare function mergeAgentsMd(opts: MergeOptions): Promise<MergeResult>;
//# sourceMappingURL=merger.d.ts.map