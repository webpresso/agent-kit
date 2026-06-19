/**
 * `example-skill` scaffolder preset.
 *
 * Copies the `hello-webpresso` SKILL.md template into `.agent/skills/hello-webpresso/`
 * so new consumers have an immediately runnable skill that verifies webpresso is wired.
 *
 * After writing, attempts `wp compile` non-fatally so IDEs pick up the new skill.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const SKILL_SLUG = 'hello-webpresso';
const TEMPLATE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'SKILL.md.template');
export async function scaffoldExampleSkill(cwd, { spawn = spawnSync, exists = existsSync, } = {}) {
    const skillDir = join(cwd, '.agent', 'skills', SKILL_SLUG);
    const skillFile = join(skillDir, 'SKILL.md');
    if (exists(skillFile))
        return;
    mkdirSync(skillDir, { recursive: true });
    const template = readFileSync(TEMPLATE_PATH, 'utf-8');
    writeFileSync(skillFile, template, 'utf-8');
    // Non-fatal: `wp compile` may not be on PATH in all environments.
    try {
        spawn('wp', ['compile'], { cwd, stdio: 'ignore' });
    }
    catch {
        // compile failure is non-fatal
    }
}
//# sourceMappingURL=index.js.map