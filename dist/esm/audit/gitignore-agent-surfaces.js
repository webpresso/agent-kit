import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const EXPECTED_PATHS = [
    '.claude/rules/',
    '.claude/skills/',
    '.cursor/rules/',
    '.windsurf/skills/',
    '.gemini/commands/',
    '.opencode/commands/',
    '.agents/skills/',
    '.agent/.merged.provenance.json',
    '.agent/.compile-manifest.json',
    '.agent/.rotation-log.jsonl',
];
export async function auditGitignoreAgentSurfaces(cwd) {
    const gitignorePath = join(cwd, '.gitignore');
    const violations = [];
    if (!existsSync(gitignorePath)) {
        return {
            ok: false,
            title: 'gitignore agent surfaces',
            checked: EXPECTED_PATHS.length,
            violations: [
                { file: '.gitignore', message: '.gitignore not found — run `ak setup` to scaffold it' },
            ],
        };
    }
    let content;
    try {
        content = readFileSync(gitignorePath, 'utf-8');
    }
    catch {
        return {
            ok: false,
            title: 'gitignore agent surfaces',
            checked: EXPECTED_PATHS.length,
            violations: [{ file: '.gitignore', message: 'failed to read .gitignore' }],
        };
    }
    const lines = new Set(content
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean));
    for (const expected of EXPECTED_PATHS) {
        if (!lines.has(expected)) {
            violations.push({
                file: '.gitignore',
                message: `Missing gitignore entry: ${expected} — run \`ak setup\` to add generated agent surface paths`,
            });
        }
    }
    return {
        ok: violations.length === 0,
        title: 'gitignore agent surfaces',
        checked: EXPECTED_PATHS.length,
        violations,
    };
}
//# sourceMappingURL=gitignore-agent-surfaces.js.map