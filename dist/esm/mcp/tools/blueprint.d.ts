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
import type { ToolDescriptor } from '#mcp/auto-discover';
declare const inputSchema: z.ZodObject<{
    action: z.ZodEnum<{
        list: "list";
        new: "new";
        audit: "audit";
    }>;
    goal: z.ZodOptional<z.ZodString>;
    complexity: z.ZodOptional<z.ZodEnum<{
        XS: "XS";
        S: "S";
        M: "M";
        L: "L";
        XL: "XL";
    }>>;
    path: z.ZodOptional<z.ZodString>;
    all: z.ZodOptional<z.ZodBoolean>;
    strict: z.ZodOptional<z.ZodBoolean>;
    staged: z.ZodOptional<z.ZodBoolean>;
    status: z.ZodOptional<z.ZodEnum<{
        draft: "draft";
        planned: "planned";
        "in-progress": "in-progress";
        parked: "parked";
        completed: "completed";
        archived: "archived";
    }>>;
}, z.core.$strip>;
export type AkBlueprintInput = z.infer<typeof inputSchema>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=blueprint.d.ts.map