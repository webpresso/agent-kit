/**
 * `vision` scaffolder preset.
 *
 * Drops a starter `VISION.md` at repo root from `catalog/vision/VISION.md.tmpl`
 * with `{{REPO_NAME}}`, `{{TODAY}}`, and (optionally) interview-derived
 * substitutions. Idempotent: existing files are protected by the standard
 * merge policy (reported as drift unless `--overwrite`).
 *
 * When `answers` is provided (from `maybeRunVisionInterview`), the
 * placeholders `{{ONE_LINER}}`, `{{PROBLEM}}`, `{{TAGLINE}}`, `{{IN_SCOPE}}`,
 * `{{OUT_OF_SCOPE}}`, and `{{PRINCIPLES}}` are replaced with the operator's
 * own words. Skipped fields fall back to the original prose stubs so the
 * audit (`ak audit vision`) still passes minimally.
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
    const rendered = applyAnswers(template, repoName, today, input.answers ?? null);
    const target = path.join(input.repoRoot, 'VISION.md');
    return writeFileMerged(target, rendered, input.options);
}
const STUB = {
    oneLiner: 'One-line summary of what this repo does. Replace this with a real description before merging.',
    problem: 'What problem does this repo solve? What pain exists today that this work addresses? 2-4 sentences. Be concrete — name the actors and the friction.',
    tagline: 'One-line tagline that fits on a sticker.',
    inScope: ['- Things this repo owns.', '- Surfaces it presents to consumers.'].join('\n'),
    outOfScope: [
        '- Things that look related but belong elsewhere — name where they belong.',
        '- Hypothetical "could fit here" scope that isn\'t earning its keep.',
    ].join('\n'),
    principles: [
        '- Principle 1 — short rationale.',
        '- Principle 2 — short rationale.',
        '- Principle 3 — short rationale.',
    ].join('\n'),
};
function applyAnswers(template, repoName, today, answers) {
    return template
        .replaceAll('{{REPO_NAME}}', repoName)
        .replaceAll('{{TODAY}}', today)
        .replaceAll('{{ONE_LINER}}', nonEmpty(answers?.oneLiner) ?? STUB.oneLiner)
        .replaceAll('{{PROBLEM}}', nonEmpty(answers?.problem) ?? STUB.problem)
        .replaceAll('{{TAGLINE}}', nonEmpty(answers?.tagline) ?? STUB.tagline)
        .replaceAll('{{IN_SCOPE}}', renderList(answers?.inScope) ?? STUB.inScope)
        .replaceAll('{{OUT_OF_SCOPE}}', renderList(answers?.outOfScope) ?? STUB.outOfScope)
        .replaceAll('{{PRINCIPLES}}', renderList(answers?.principles) ?? STUB.principles);
}
function nonEmpty(value) {
    if (value === undefined)
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function renderList(items) {
    if (!items || items.length === 0)
        return null;
    return items.map((item) => `- ${item}`).join('\n');
}
//# sourceMappingURL=index.js.map