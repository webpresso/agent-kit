import { existsSync, readFileSync } from 'node:fs';
export type GstackSkillHost = 'claude' | 'codex';
export type GstackSkillCollision = {
    host: GstackSkillHost;
    name: string;
    path: string;
};
export declare const WEBPRESSO_GSTACK_SKILLS: readonly ["claude", "plan-eng-review", "plan-ceo-review", "plan-design-review", "review"];
export declare function auditGstackSkillCollisions(input: {
    claudeSkillsRoot: string;
    codexSkillsRoot: string;
    exists?: typeof existsSync;
    readFile?: typeof readFileSync;
}): GstackSkillCollision[];
//# sourceMappingURL=collision-audit.d.ts.map