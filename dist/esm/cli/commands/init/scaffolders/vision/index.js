/**
 * `vision` scaffolder preset.
 *
 * Drops a starter `VISION.md` at repo root from `catalog/vision/VISION.md.tmpl`
 * with simple `{{REPO_NAME}}` and `{{TODAY}}` substitutions. Idempotent:
 * existing files are protected by the standard merge policy (sidecar `.new`
 * unless `--overwrite`).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFileMerged } from '#cli/commands/init/merge';
export function scaffoldVision(input) {
    const templatePath = path.join(input.catalogDir, 'vision', 'VISION.md.tmpl');
    if (!existsSync(templatePath)) {
        throw new Error(`vision scaffolder: template not found at ${templatePath}`);
    }
    const template = readFileSync(templatePath, 'utf8');
    const today = new Date().toISOString().slice(0, 10);
    const repoName = path.basename(input.repoRoot);
    const rendered = template
        .replaceAll('{{REPO_NAME}}', repoName)
        .replaceAll('{{TODAY}}', today);
    const target = path.join(input.repoRoot, 'VISION.md');
    return writeFileMerged(target, rendered, input.options);
}
//# sourceMappingURL=index.js.map