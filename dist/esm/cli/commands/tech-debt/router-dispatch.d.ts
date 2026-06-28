import { type TechDebtCategory, type TechDebtSeverity, type TechDebtStatus, type ReviewCadence } from "#tech-debt/index";
export interface TechDebtNewOptions {
    severity?: TechDebtSeverity | string;
    category?: TechDebtCategory | string;
    reviewCadence?: ReviewCadence | string;
    status?: TechDebtStatus | string;
    dryRun?: boolean;
    cwd?: string;
    fromAudit?: string;
}
export interface TechDebtListOptions {
    status?: string;
    severity?: string;
    category?: string;
    cwd?: string;
}
export interface TechDebtReviewOptions {
    cwd?: string;
}
export type TechDebtCommandOptions = TechDebtNewOptions & TechDebtListOptions & TechDebtReviewOptions;
export declare function executeTechDebtSubcommand(subcommand: string, args: string[], options: TechDebtCommandOptions): Promise<void>;
//# sourceMappingURL=router-dispatch.d.ts.map