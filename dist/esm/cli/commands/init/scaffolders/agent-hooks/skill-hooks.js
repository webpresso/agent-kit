import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
const SKILL_HOOK_EVENTS = [
    'PreToolUse',
    'PostToolUse',
    'Stop',
    'SessionStart',
    'UserPromptSubmit',
];
const RESERVED_GLOBAL_BINS = [
    'ak-pretool-guard',
    'ak-post-tool',
    'ak-guard-switch',
    'ak-sessionstart-routing',
    'ak-stop-qa',
];
const TRACEABILITY_PREFIX = '# from-skill:';
const SkillHookEntrySchema = z
    .object({
    matcher: z.string().trim().min(1).optional(),
    command: z.string().trim().min(1, 'command is required'),
    timeout: z.number().int().positive().optional(),
})
    .strict();
const SkillHooksSchema = z
    .object({
    PreToolUse: z.array(SkillHookEntrySchema).optional(),
    PostToolUse: z.array(SkillHookEntrySchema).optional(),
    Stop: z.array(SkillHookEntrySchema).optional(),
    SessionStart: z.array(SkillHookEntrySchema).optional(),
    UserPromptSubmit: z.array(SkillHookEntrySchema).optional(),
})
    .strict()
    .superRefine((hooks, ctx) => {
    for (const event of ['PreToolUse', 'PostToolUse']) {
        const entries = hooks[event] ?? [];
        entries.forEach((entry, index) => {
            if (!entry.matcher) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `${event} hooks require a matcher`,
                    path: [event, index, 'matcher'],
                });
            }
        });
    }
    for (const event of SKILL_HOOK_EVENTS) {
        const entries = hooks[event] ?? [];
        entries.forEach((entry, index) => {
            const reserved = RESERVED_GLOBAL_BINS.find((bin) => entry.command.includes(bin));
            if (reserved) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `reserved global hook command ${reserved} is not allowed in skill hooks`,
                    path: [event, index, 'command'],
                });
            }
        });
    }
});
function formatIssues(error) {
    return error.issues
        .map((issue) => `${issue.path.join('.') || 'hooks'}: ${issue.message}`)
        .join('; ');
}
export function validateSkillHooks(skillName, hooks) {
    const parsed = SkillHooksSchema.safeParse(hooks ?? {});
    if (!parsed.success) {
        throw new Error(`Invalid hooks frontmatter in skill ${skillName}: ${formatIssues(parsed.error)}`);
    }
    return parsed.data;
}
export function extractSkillHooks(skillsDir) {
    if (!existsSync(skillsDir))
        return [];
    const hooks = [];
    const skillNames = readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    for (const skillName of skillNames) {
        const skillPath = join(skillsDir, skillName, 'SKILL.md');
        if (!existsSync(skillPath))
            continue;
        const parsed = matter(readFileSync(skillPath, 'utf8'));
        const validated = validateSkillHooks(skillName, parsed.data.hooks);
        for (const event of SKILL_HOOK_EVENTS) {
            for (const entry of validated[event] ?? []) {
                hooks.push({
                    skillName,
                    event,
                    matcher: entry.matcher,
                    command: entry.command,
                    timeout: entry.timeout,
                });
            }
        }
    }
    return hooks;
}
export function buildSkillTag(skillName) {
    return `${TRACEABILITY_PREFIX} ${skillName}`;
}
export function isTaggedSkillHook(command) {
    return typeof command === 'string' && command.includes(TRACEABILITY_PREFIX);
}
//# sourceMappingURL=skill-hooks.js.map