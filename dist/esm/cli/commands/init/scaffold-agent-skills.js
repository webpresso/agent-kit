/**
 * Scaffold `agent-skills/` — consumer-owned canonical skills directory whose
 * contents are projected into the various AI surfaces (`.agent/skills/`,
 * `.cursor/skills/`, `.claude/skills/`, etc.) by the symlink/sync layer.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { patchGitignore } from './gitignore-patcher.js';
import { writeFileMerged } from './merge.js';
const AGENT_SKILLS_README = `# agent-skills/

This directory holds consumer-owned **agent skills** — the canonical source
of executable skill definitions that get projected into per-tool surfaces
(\`.agent/skills/\`, \`.cursor/skills/\`, \`.claude/skills/\`, etc.) by
\`wp sync\`.

## Authoring

- Add a new skill with \`wp skill new <slug>\`.
- Each skill is a directory with a \`SKILL.md\` and optional supporting files.
- Edit files here — never the projected copies under \`.agent/\` etc.

## Lifecycle

- Files in \`agent-skills/\` are committed.
- Projected surfaces (\`.agent/skills/\`, \`.claude/skills/\`, …) are gitignored.
- Run \`wp sync\` after editing to refresh derived surfaces.
`;
const SKILL_IGNORE_PATTERNS = [
    '.agent/skills/',
    '.cursor/skills/',
    '.windsurf/skills/',
    '.claude/skills/',
    '.gemini/commands/',
    '.agents/skills/',
];
export function scaffoldAgentSkills(opts) {
    const { cwd, dryRun, overwrite } = opts;
    const mergeOpts = { dryRun, overwrite };
    const dir = join(cwd, 'agent-skills');
    const gitkeep = join(dir, '.gitkeep');
    const results = [];
    const gitkeepExisted = existsSync(gitkeep);
    if (!dryRun) {
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        if (!gitkeepExisted)
            writeFileSync(gitkeep, '');
    }
    results.push({
        targetPath: gitkeep,
        action: gitkeepExisted ? 'identical' : dryRun ? 'skipped-dry' : 'created',
    });
    results.push(writeFileMerged(join(dir, 'README.md'), AGENT_SKILLS_README, mergeOpts));
    results.push(patchGitignore(join(cwd, '.gitignore'), { id: 'skill-sync', patterns: [...SKILL_IGNORE_PATTERNS] }, mergeOpts));
    return { results };
}
//# sourceMappingURL=scaffold-agent-skills.js.map