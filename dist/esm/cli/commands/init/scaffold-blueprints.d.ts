import { type MergeOptions, type MergeResult } from './merge.js';
export declare const BLUEPRINT_STATES: readonly ["draft", "planned", "in-progress", "completed", "parked", "archived"];
export interface ScaffoldBlueprintsInput {
    repoRoot: string;
    options: MergeOptions;
}
export declare function scaffoldBlueprints(input: ScaffoldBlueprintsInput): MergeResult[];
//# sourceMappingURL=scaffold-blueprints.d.ts.map