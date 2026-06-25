/**
 * Opt-in skill selection — `--with`, `--all`, and an optional TTY prompt.
 *
 * Default shared favorites are always projected; this module governs the
 * non-default add-ons only:
 *   - shared add-ons (systematic-debugging, test-driven-development,
 *     deep-research)
 *   - rendered add-on (monorepo-navigation)
 *   - Tier-3 skills such as base-kit and framework/domain extras
 *
 * Kept deliberately minimal: we don't pull in an interactive prompt library.
 * If the user runs `wp init` in a TTY without flags, we use
 * `node:readline/promises` to ask a single yes/no per opt-in skill. If stdin
 * isn't a TTY and no flags are provided, we default to installing the
 * `base-kit` bootstrap. `base-kit` is default-on for every selection mode; use
 * `--without base-kit` to opt out explicitly.
 */
import { createInterface } from "node:readline/promises";
import { OPTIONAL_SHARED_SKILLS, RENDERED_SKILLS } from "./scaffold-agent.js";
export const TIER3_SKILLS = [
    "base-kit",
    "tanstack-query",
    "better-auth-best-practices",
    "react-doctor",
    "frontend-design",
    "web-design-guidelines",
    "vercel-react-best-practices",
];
const DEFAULT_TIER3_SKILLS = ["base-kit"];
export const OPT_IN_SHARED_SKILLS = [...OPTIONAL_SHARED_SKILLS, ...RENDERED_SKILLS];
export const OPT_IN_SKILLS = [...OPT_IN_SHARED_SKILLS, ...TIER3_SKILLS];
export function parseWithFlag(raw) {
    if (!raw)
        return [];
    return raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}
export function validateTier3Names(names) {
    const valid = [];
    const invalid = [];
    const allowed = new Set(OPT_IN_SKILLS);
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
        throw new Error(`Unknown opt-in skills in --without: ${invalid.join(", ")}\nAvailable: ${OPT_IN_SKILLS.join(", ")}`);
    }
    return valid;
}
function defaultOnUnlessOptedOut(selected, withoutFlag) {
    const without = new Set(validateWithoutFlag(withoutFlag));
    const withDefault = new Set([...DEFAULT_TIER3_SKILLS, ...selected]);
    for (const skill of without)
        withDefault.delete(skill);
    return OPT_IN_SKILLS.filter((skill) => withDefault.has(skill));
}
export async function resolveTier3Selection(input) {
    if (input.allFlag) {
        return {
            selected: defaultOnUnlessOptedOut(OPT_IN_SKILLS, input.withoutFlag),
            aborted: false,
            source: "all",
        };
    }
    if (input.withFlag !== undefined) {
        const requested = parseWithFlag(input.withFlag);
        const { valid, invalid } = validateTier3Names(requested);
        if (invalid.length > 0) {
            throw new Error(`Unknown opt-in skills: ${invalid.join(", ")}\nAvailable: ${OPT_IN_SKILLS.join(", ")}`);
        }
        return {
            selected: defaultOnUnlessOptedOut(valid, input.withoutFlag),
            aborted: false,
            source: "with",
        };
    }
    if (input.existing && input.existing.length > 0) {
        const { valid } = validateTier3Names(input.existing);
        return {
            selected: defaultOnUnlessOptedOut(valid, input.withoutFlag),
            aborted: false,
            source: "existing",
        };
    }
    if (input.yesFlag || !input.isTTY) {
        return {
            selected: defaultOnUnlessOptedOut([], input.withoutFlag),
            aborted: false,
            source: "default",
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
        (input.outputStream ?? process.stdout).write("Opt-in skill selection (press Enter to skip, y to include, q to abort):\n");
        for (const skill of OPT_IN_SKILLS) {
            if (skill === "base-kit") {
                selected.push(skill);
                (input.outputStream ?? process.stdout).write("  base-kit is default-on; pass --without base-kit to opt out.\n");
                continue;
            }
            const answer = (await rl.question(`  include ${skill}? [y/N/q] `)).trim().toLowerCase();
            if (answer === "q") {
                return { selected: [], aborted: true, source: "interactive" };
            }
            if (answer === "y" || answer === "yes")
                selected.push(skill);
        }
        return { selected, aborted: false, source: "interactive" };
    }
    finally {
        rl.close();
    }
}
//# sourceMappingURL=prompts.js.map