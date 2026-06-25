import type { Database } from "#db/sqlite.js";
export interface TemplateRunResult {
    readonly rows: unknown[];
    readonly capped: boolean;
    readonly rowCount: number;
}
export declare function runTemplate(db: Database, templateId: string, params: Record<string, unknown>): TemplateRunResult;
//# sourceMappingURL=template-runner.d.ts.map