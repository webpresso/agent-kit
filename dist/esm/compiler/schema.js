import { z } from 'zod';
// Argument descriptor used in SKILL.md frontmatter
const skillArgumentSchema = z.object({
    name: z.string(),
    description: z.string(),
    required: z.boolean().optional(),
});
export const skillFrontmatterSchema = z
    .object({
    name: z.string(),
    description: z.string(),
})
    .passthrough()
    .extend({
    when_to_use: z.string().optional(),
    'argument-hint': z.string().optional(),
    arguments: z.array(skillArgumentSchema).optional(),
    'disable-model-invocation': z.boolean().optional(),
    'user-invocable': z.boolean().optional(),
    'allowed-tools': z.array(z.string()).optional(),
});
export const commandFrontmatterSchema = z
    .object({
    description: z.string(),
})
    .passthrough()
    .extend({
    agent: z.string().optional(),
    model: z.string().optional(),
});
export const agentFrontmatterSchema = z
    .object({
    name: z.string(),
    description: z.string(),
})
    .passthrough()
    .extend({
    tools: z.array(z.unknown()).optional(),
    disallowedTools: z.array(z.unknown()).optional(),
    model: z.string().optional(),
    permissionMode: z.string().optional(),
    skills: z.array(z.unknown()).optional(),
    mcpServers: z.record(z.string(), z.unknown()).optional(),
    hooks: z.record(z.string(), z.unknown()).optional(),
    maxTurns: z.number().optional(),
    isolation: z.enum(['worktree']).optional(),
    color: z.string().optional(),
});
//# sourceMappingURL=schema.js.map