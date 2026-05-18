import { z } from 'zod';
export declare const graphNodeTypeSchema: z.ZodEnum<{
    blueprint: "blueprint";
    decision: "decision";
    task: "task";
    external: "external";
    milestone: "milestone";
    tech_debt: "tech_debt";
}>;
export declare const graphEdgeTypeSchema: z.ZodEnum<{
    depends_on: "depends_on";
    blocks: "blocks";
    relates_to: "relates_to";
}>;
export declare const graphNodeSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
        blueprint: "blueprint";
        decision: "decision";
        task: "task";
        external: "external";
        milestone: "milestone";
        tech_debt: "tech_debt";
    }>;
    label: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export declare const graphEdgeSchema: z.ZodObject<{
    source: z.ZodString;
    target: z.ZodString;
    type: z.ZodEnum<{
        depends_on: "depends_on";
        blocks: "blocks";
        relates_to: "relates_to";
    }>;
    label: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export declare const graphLayoutSchema: z.ZodObject<{
    direction: z.ZodDefault<z.ZodEnum<{
        TD: "TD";
        LR: "LR";
        BT: "BT";
        RL: "RL";
    }>>;
    rankdir: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const normalizedGraphSchema: z.ZodObject<{
    nodes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<{
            blueprint: "blueprint";
            decision: "decision";
            task: "task";
            external: "external";
            milestone: "milestone";
            tech_debt: "tech_debt";
        }>;
        label: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>;
    edges: z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        target: z.ZodString;
        type: z.ZodEnum<{
            depends_on: "depends_on";
            blocks: "blocks";
            relates_to: "relates_to";
        }>;
        label: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>;
    layout: z.ZodOptional<z.ZodObject<{
        direction: z.ZodDefault<z.ZodEnum<{
            TD: "TD";
            LR: "LR";
            BT: "BT";
            RL: "RL";
        }>>;
        rankdir: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type GraphNodeType = z.infer<typeof graphNodeTypeSchema>;
export type GraphEdgeType = z.infer<typeof graphEdgeTypeSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type GraphLayout = z.infer<typeof graphLayoutSchema>;
export type NormalizedGraph = z.infer<typeof normalizedGraphSchema>;
//# sourceMappingURL=schema.d.ts.map