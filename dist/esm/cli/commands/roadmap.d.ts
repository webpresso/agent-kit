import type { CAC } from "cac";
import type { ShowBlueprintResult } from "./blueprint/router.js";
export declare function getRoadmapHelpText(): string;
export declare function assertParentRoadmap(result: ShowBlueprintResult): ShowBlueprintResult;
export declare function formatRoadmapDetails(result: ShowBlueprintResult, childResults: readonly ShowBlueprintResult[]): string;
export declare function registerRoadmapCommand(cli: CAC): void;
//# sourceMappingURL=roadmap.d.ts.map