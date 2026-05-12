/**
 * Vision interview — asks the operator a few short questions to seed
 * `VISION.md` with a tailored north-star instead of the generic template
 * stub. Runs only on a fresh consumer (no existing `VISION.md`) when
 * `process.stdin.isTTY` and no `--yes` was passed.
 *
 * Matches the existing `node:readline/promises` pattern used by
 * Tier-3 skill selection — no new prompt-library dependency.
 *
 * Every answer is optional. Skipped fields fall back to the template's
 * prose stubs so the audit (`ak audit vision`) still passes minimally.
 */
import { createInterface } from 'node:readline/promises';
/**
 * Returns answers to interpolate into the template, or `null` if the
 * interview should not run (non-TTY, --yes, or VISION.md already exists).
 */
export async function maybeRunVisionInterview(input) {
    if (input.visionExists)
        return null;
    if (input.yesFlag)
        return null;
    if (!input.isTTY)
        return null;
    const rl = createInterface({
        input: input.inputStream ?? process.stdin,
        output: input.outputStream ?? process.stdout,
    });
    const out = input.outputStream ?? process.stdout;
    try {
        out.write(`\n📜 Seeding VISION.md for ${input.repoName} (press Enter to skip any line)\n\n`);
        const oneLiner = await ask(rl, '  In one sentence, what does this repo do? ');
        const tagline = await ask(rl, '  North-star tagline (the sticker — short!): ');
        const problem = await ask(rl, '  What pain does this solve? (1-2 sentences): ');
        const inScopeRaw = await ask(rl, '  In scope (comma-separated, blank to skip): ');
        const outOfScopeRaw = await ask(rl, '  Out of scope (comma-separated; mention where they belong): ');
        const principlesRaw = await askMultiline(rl, '  Design principles (one per line, blank line to finish):');
        return {
            oneLiner,
            tagline,
            problem,
            inScope: splitList(inScopeRaw),
            outOfScope: splitList(outOfScopeRaw),
            principles: principlesRaw,
        };
    }
    finally {
        rl.close();
    }
}
async function ask(rl, prompt) {
    const answer = (await rl.question(prompt)).trim();
    return answer;
}
async function askMultiline(rl, prompt) {
    const out = rl.output ?? process.stdout;
    out.write(`${prompt}\n`);
    const collected = [];
    while (true) {
        const line = (await rl.question('    - ')).trim();
        if (line.length === 0)
            break;
        collected.push(line);
    }
    return collected;
}
function splitList(raw) {
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}
//# sourceMappingURL=interview.js.map