import type Database from 'better-sqlite3';
export interface TemplateRunResult {
    readonly rows: unknown[];
    readonly capped: boolean;
    readonly rowCount: number;
}
export declare function runTemplate(db: Database.Database, templateId: string, params: Record<string, unknown>): TemplateRunResult;
//# sourceMappingURL=template-runner.d.ts.map