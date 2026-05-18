import { z } from 'zod';
export interface QueryTemplate {
    readonly id: string;
    readonly description: string;
    readonly sql: string;
    readonly paramSchema: z.ZodTypeAny;
    readonly maxRows: number;
}
export declare const QUERY_TEMPLATES: readonly QueryTemplate[];
export declare function findTemplate(id: string): QueryTemplate | undefined;
//# sourceMappingURL=templates.d.ts.map