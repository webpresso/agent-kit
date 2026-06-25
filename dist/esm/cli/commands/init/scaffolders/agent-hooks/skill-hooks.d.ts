import { z } from "zod";
declare const SKILL_HOOK_EVENTS: readonly ["PreToolUse", "PostToolUse", "Stop", "SessionStart", "UserPromptSubmit"];
export type SkillHookEvent = (typeof SKILL_HOOK_EVENTS)[number];
export interface SkillHook {
    skillName: string;
    event: SkillHookEvent;
    matcher?: string;
    command: string;
    timeout?: number;
}
declare const SkillHookEntrySchema: z.ZodObject<{
    matcher: z.ZodOptional<z.ZodString>;
    command: z.ZodString;
    timeout: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare function validateSkillHooks(skillName: string, hooks: unknown): Record<SkillHookEvent, Array<z.infer<typeof SkillHookEntrySchema>>>;
export declare function extractSkillHooks(skillsDir: string): SkillHook[];
export declare function buildSkillTag(skillName: string): string;
export declare function isTaggedSkillHook(command: string | undefined): boolean;
export {};
//# sourceMappingURL=skill-hooks.d.ts.map