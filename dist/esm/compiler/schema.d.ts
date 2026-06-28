import { z } from "zod";
declare const skillArgumentSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    required: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const skillFrontmatterSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    when_to_use: z.ZodOptional<z.ZodString>;
    "argument-hint": z.ZodOptional<z.ZodString>;
    arguments: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        description: z.ZodString;
        required: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>>;
    "disable-model-invocation": z.ZodOptional<z.ZodBoolean>;
    "user-invocable": z.ZodOptional<z.ZodBoolean>;
    "allowed-tools": z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$loose>;
export declare const commandFrontmatterSchema: z.ZodObject<{
    description: z.ZodString;
    agent: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
export declare const agentFrontmatterSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    tools: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    disallowedTools: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    model: z.ZodOptional<z.ZodString>;
    permissionMode: z.ZodOptional<z.ZodString>;
    skills: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    mcpServers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    hooks: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    maxTurns: z.ZodOptional<z.ZodNumber>;
    isolation: z.ZodOptional<z.ZodEnum<{
        worktree: "worktree";
    }>>;
    color: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;
export type CommandFrontmatter = z.infer<typeof commandFrontmatterSchema>;
export type AgentFrontmatter = z.infer<typeof agentFrontmatterSchema>;
export type SkillArgument = z.infer<typeof skillArgumentSchema>;
export {};
//# sourceMappingURL=schema.d.ts.map