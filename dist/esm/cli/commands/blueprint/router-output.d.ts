import type { BlueprintAuditResult, BlueprintSummary } from '#local';
import type { CreateBlueprintResult, ExecuteBlueprintResult, ShowBlueprintResult } from './router.js';
export declare function getBlueprintHelpText(): string;
export declare function formatBlueprintSummaries(summaries: BlueprintSummary[]): string;
export declare function formatBlueprintDetails(result: ShowBlueprintResult): string;
export declare function formatBlueprintCreation(result: CreateBlueprintResult): string;
export declare function formatBlueprintExecution(result: ExecuteBlueprintResult): string;
export declare function formatBlueprintAudit(result: BlueprintAuditResult): string;
export declare function printBlueprintOutput(value: object | string, asJson?: boolean): void;
export declare function handleBlueprintError(error: unknown): never;
//# sourceMappingURL=router-output.d.ts.map