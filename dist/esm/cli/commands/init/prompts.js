/**
 * Tier-3 skill selection — `--with`, `--all`, and an optional TTY prompt.
 *
 * Kept deliberately minimal: we don't pull in an interactive prompt library.
 * If the user runs `wp init` in a TTY without flags, we use `node:readline/promises`
 * to ask a single yes/no per Tier-3 skill. If stdin isn't a TTY and no flags
 * are provided, we default to installing the `base-kit` Tier-3 bootstrap.
 * `base-kit` is default-on for every selection mode; use `--without base-kit`
 * to opt out explicitly.
 */
import { createInterface } from 'node:readline/promises';
export const TIER3_SKILLS = [
    'base-kit',
    'tanstack-query',
    'better-auth-best-practices',
    'react-doctor',
    'frontend-design',
    'web-design-guidelines',
    'vercel-react-best-practices',
];
const DEFAULT_TIER3_SKILLS = ['base-kit'];
export function parseWithFlag(raw) {
    if (!raw)
        return [];
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}
export function validateTier3Names(names) {
    const valid = [];
    const invalid = [];
    const allowed = new Set(TIER3_SKILLS);
    for (const name of names) {
        if (allowed.has(name))
            valid.push(name);
        else
            invalid.push(name);
    }
    return { valid, invalid };
}
function validateWithoutFlag(raw) {
    const requested = parseWithFlag(raw);
    const { valid, invalid } = validateTier3Names(requested);
    if (invalid.length > 0) {
        throw new Error(`Unknown Tier-3 skills in --without: ${invalid.join(', ')}\nAvailable: ${TIER3_SKILLS.join(', ')}`);
    }
    return valid;
}
function defaultOnUnlessOptedOut(selected, withoutFlag) {
    const without = new Set(validateWithoutFlag(withoutFlag));
    const withDefault = new Set([...DEFAULT_TIER3_SKILLS, ...selected]);
    for (const skill of without)
        withDefault.delete(skill);
    return TIER3_SKILLS.filter((skill) => withDefault.has(skill));
}
export async function resolveTier3Selection(input) {
    if (input.allFlag) {
        return {
            selected: defaultOnUnlessOptedOut(TIER3_SKILLS, input.withoutFlag),
            aborted: false,
            source: 'all',
        };
    }
    if (input.withFlag !== undefined) {
        const requested = parseWithFlag(input.withFlag);
        const { valid, invalid } = validateTier3Names(requested);
        if (invalid.length > 0) {
            throw new Error(`Unknown Tier-3 skills: ${invalid.join(', ')}\nAvailable: ${TIER3_SKILLS.join(', ')}`);
        }
        return {
            selected: defaultOnUnlessOptedOut(valid, input.withoutFlag),
            aborted: false,
            source: 'with',
        };
    }
    if (input.existing && input.existing.length > 0) {
        const { valid } = validateTier3Names(input.existing);
        return {
            selected: defaultOnUnlessOptedOut(valid, input.withoutFlag),
            aborted: false,
            source: 'existing',
        };
    }
    if (input.yesFlag || !input.isTTY) {
        return {
            selected: defaultOnUnlessOptedOut([], input.withoutFlag),
            aborted: false,
            source: 'default',
        };
    }
    const result = await interactivePrompt(input);
    return {
        ...result,
        selected: defaultOnUnlessOptedOut(result.selected, input.withoutFlag),
    };
}
async function interactivePrompt(input) {
    const rl = createInterface({
        input: input.inputStream ?? process.stdin,
        output: input.outputStream ?? process.stdout,
    });
    const selected = [];
    try {
        ;
        (input.outputStream ?? process.stdout).write('Tier-3 skill selection (press Enter to skip, y to include, q to abort):\n');
        for (const skill of TIER3_SKILLS) {
            if (skill === 'base-kit') {
                selected.push(skill);
                (input.outputStream ?? process.stdout).write('  base-kit is default-on; pass --without base-kit to opt out.\n');
                continue;
            }
            const answer = (await rl.question(`  include ${skill}? [y/N/q] `)).trim().toLowerCase();
            if (answer === 'q') {
                return { selected: [], aborted: true, source: 'interactive' };
            }
            if (answer === 'y' || answer === 'yes')
                selected.push(skill);
        }
        return { selected, aborted: false, source: 'interactive' };
    }
    finally {
        rl.close();
    }
}
//# sourceMappingURL=prompts.js.map