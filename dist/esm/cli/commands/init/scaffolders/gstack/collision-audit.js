import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
export const WEBPRESSO_GSTACK_SKILLS = [
    'claude',
    'plan-eng-review',
    'plan-ceo-review',
    'plan-design-review',
    'review',
];
export function auditGstackSkillCollisions(input) {
    const exists = input.exists ?? existsSync;
    const readFile = input.readFile ?? readFileSync;
    const collisions = [];
    for (const host of ['claude', 'codex']) {
        const root = host === 'claude' ? input.claudeSkillsRoot : input.codexSkillsRoot;
        for (const name of WEBPRESSO_GSTACK_SKILLS) {
            const skillPath = path.join(root, name, 'SKILL.md');
            if (!exists(skillPath))
                continue;
            let content = '';
            try {
                content = readFile(skillPath, 'utf8');
            }
            catch {
                content = '';
            }
            if (!content.includes('Derived from MIT-licensed gstack workflow ideas')) {
                collisions.push({ host, name, path: skillPath });
            }
        }
    }
    return collisions;
}
//# sourceMappingURL=collision-audit.js.map