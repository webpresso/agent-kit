/**
 * `example-skill` scaffolder preset.
 *
 * Copies the `hello-webpresso` SKILL.md template into `.agent/skills/hello-webpresso/`
 * so new consumers have an immediately runnable skill that verifies agent-kit is wired.
 *
 * After writing, attempts `wp compile` non-fatally so IDEs pick up the new skill.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
export declare function scaffoldExampleSkill(cwd: string, { spawn, exists, }?: {
    spawn?: typeof spawnSync;
    exists?: typeof existsSync;
}): Promise<void>;
//# sourceMappingURL=index.d.ts.map