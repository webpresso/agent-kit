import type { Blueprint, BlueprintAuditResult, BlueprintSummary } from "#local";
import type { CreateBlueprintResult, ExecuteBlueprintResult, ShowBlueprintResult } from "./router.js";
export declare function formatTaskLine(task: Blueprint["tasks"][number]): string;
export declare function getBlueprintHelpText(): string;
export interface BlueprintInventorySummary {
    total: number;
    byStatus: Record<string, number>;
    byType: Record<BlueprintSummary["type"], number>;
    anomalies: {
        completedZeroTask: number;
    };
}
export declare function summarizeBlueprintInventory(summaries: BlueprintSummary[]): BlueprintInventorySummary;
export declare function formatBlueprintInventorySummary(summary: BlueprintInventorySummary): string;
export declare function formatBlueprintSummaries(summaries: BlueprintSummary[]): string;
export declare function formatBlueprintDetails(result: ShowBlueprintResult): string;
export declare function formatBlueprintCreation(result: CreateBlueprintResult): string;
export declare function formatBlueprintExecution(result: ExecuteBlueprintResult): string;
export declare function formatBlueprintAudit(result: BlueprintAuditResult): string;
export declare function printBlueprintOutput(value: object | string, asJson?: boolean): void;
export declare class BlueprintCliError extends Error {
    constructor(message: string);
}
export declare function handleBlueprintError(error: unknown): never;
//# sourceMappingURL=router-output.d.ts.map