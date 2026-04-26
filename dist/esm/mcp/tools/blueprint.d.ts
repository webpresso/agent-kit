/**
 * `ak_blueprint` MCP tool.
 *
 * Wraps `ak blueprint new|audit|list` behind a single MCP tool with a
 * discriminated-union input schema. Dispatch is direct library import — we
 * call the same router-level functions the CLI uses (`createBlueprint`,
 * `auditBlueprints`, `listBlueprints`) so we avoid a shell-out hop and
 * preserve typed return values.
 *
 * On error, returns a structured `{action, passed: false, error}` envelope
 * inside the MCP `text` content block instead of throwing — the MCP server
 * must keep running across bad inputs.
 */
import { z } from 'zod';
import type { ToolDescriptor } from '../auto-discover.js';
declare const inputSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    action: z.ZodLiteral<"new">;
    goal: z.ZodString;
    complexity: z.ZodDefault<z.ZodEnum<{
        XS: "XS";
        S: "S";
        M: "M";
        L: "L";
        XL: "XL";
    }>>;
}, z.core.$strip>, z.ZodObject<{
    action: z.ZodLiteral<"audit">;
    path: z.ZodOptional<z.ZodString>;
    all: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    strict: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    staged: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strip>, z.ZodObject<{
    action: z.ZodLiteral<"list">;
    status: z.ZodOptional<z.ZodEnum<{
        draft: "draft";
        planned: "planned";
        "in-progress": "in-progress";
        parked: "parked";
        completed: "completed";
        archived: "archived";
    }>>;
}, z.core.$strip>], "action">;
export type AkBlueprintInput = z.infer<typeof inputSchema>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=blueprint.d.ts.map