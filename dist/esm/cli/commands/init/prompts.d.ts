export declare const TIER3_SKILLS: readonly ["base-kit", "tanstack-query", "better-auth-best-practices", "react-doctor", "frontend-design", "web-design-guidelines", "vercel-react-best-practices"];
export type Tier3Skill = (typeof TIER3_SKILLS)[number];
export interface ResolveSkillsInput {
    withFlag?: string;
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