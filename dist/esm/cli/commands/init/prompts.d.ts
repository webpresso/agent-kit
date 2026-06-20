export declare const TIER3_SKILLS: readonly ["base-kit", "tanstack-query", "better-auth-best-practices", "react-doctor", "frontend-design", "web-design-guidelines", "vercel-react-best-practices"];
export type Tier3Skill = (typeof TIER3_SKILLS)[number];
export declare const OPT_IN_SHARED_SKILLS: readonly ["systematic-debugging", "test-driven-development", "deep-research", "monorepo-navigation"];
export declare const OPT_IN_SKILLS: readonly ["systematic-debugging", "test-driven-development", "deep-research", "monorepo-navigation", "base-kit", "tanstack-query", "better-auth-best-practices", "react-doctor", "frontend-design", "web-design-guidelines", "vercel-react-best-practices"];
export interface ResolveSkillsInput {
    withFlag?: string;
    withoutFlag?: string;
    allFlag?: boolean;
    yesFlag?: boolean;
    existing?: readonly string[];
    isTTY?: boolean;
    inputStream?: NodeJS.ReadableStream;
    outputStream?: NodeJS.WritableStream;
}
export interface ResolveSkillsResult {
    selected: string[];
    aborted: boolean;
    source: 'all' | 'with' | 'existing' | 'interactive' | 'default';
}
export declare function parseWithFlag(raw: string | undefined): string[];
export declare function validateTier3Names(names: readonly string[]): {
    valid: string[];
    invalid: string[];
};
export declare function resolveTier3Selection(input: ResolveSkillsInput): Promise<ResolveSkillsResult>;
//# sourceMappingURL=prompts.d.ts.map