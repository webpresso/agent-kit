import { getCommand, isBashInput } from '#hooks/shared/types';
import { createSkipResult } from './skip-result.js';
export const VALIDATOR_NAME = 'forbidden-commands';
export const SKIP_ENV_VAR = 'FORBIDDEN_COMMANDS_SKIP';
export const AUDIT_MODE_ENV = 'FORBIDDEN_COMMANDS_AUDIT';
export const DOCS_REF = 'AGENTS.md "Forbidden Commands (CRITICAL)" section';
const DB_HINT = 'just db-push (or just db-migrate, just db-generate)';
const LINT_BASE = 'just lint --package <name> (or --file <path>)';
const LINT_HINT = `${LINT_BASE} [--fix] [--fix-unsafe]`;
const FORMAT_HINT = 'just format (or just format-check)';
const TEST_HINT = 'just test --package <name> (or --file <path>)';
const MUTATION_HINT = 'just test --mutation --package <name>';
const TYPECHECK_HINT = 'just typecheck --package <name> (or --file <path>)';
const ENV_HINT = 'just run <cmd> (injects secrets/env automatically)';
const JUST_TASK_TARGET_HINT = 'just <task> [target] — check justfile for existing recipes, or add a new one';
const EXEC_RUNNERS = ['pnpm exec', 'pnpx', 'bunx'];
const DIRECT_RUNNERS = ['pnpm', 'bun run', 'bun'];
const SCRIPT_RUNNERS = ['pnpm run', 'pnpm', 'npm run', 'npm', 'bun run', 'bun'];
export const BLOCKED_TOOLS = [
    { tool: 'drizzle-kit', category: 'unknown', suggestion: DB_HINT, runners: ['exec', 'direct', 'bare'] },
    { tool: 'vitest', category: 'test', suggestion: TEST_HINT, runners: ['exec', 'direct', 'bare'] },
    { tool: 'oxlint', category: 'lint', suggestion: LINT_HINT, runners: ['exec', 'direct', 'bare'] },
    { tool: 'oxfmt', category: 'lint', suggestion: FORMAT_HINT, runners: ['exec', 'direct', 'bare'] },
    { tool: 'stryker', category: 'test', suggestion: MUTATION_HINT, runners: ['exec', 'bare'] },
    { tool: 'tsc', category: 'typecheck', suggestion: TYPECHECK_HINT, runners: ['exec', 'direct', 'bare'] },
    { tool: 'tsgo', category: 'typecheck', suggestion: TYPECHECK_HINT, runners: ['exec', 'direct', 'bare'] },
];
export const BLOCKED_SCRIPTS = [
    { script: 'test', category: 'test', suggestion: TEST_HINT },
    { script: 'lint', category: 'lint', suggestion: LINT_HINT },
    { script: 'typecheck', category: 'typecheck', suggestion: TYPECHECK_HINT },
];
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function buildToolPattern(prefix, tool) {
    const escaped = prefix ? `${escapeRegex(prefix)} ${escapeRegex(tool)}` : escapeRegex(tool);
    return new RegExp(`^${escaped}(\\s|$)`);
}
export function generateRules() {
    const rules = [];
    for (const spec of BLOCKED_TOOLS) {
        if (spec.runners.includes('exec')) {
            for (const runner of EXEC_RUNNERS) {
                rules.push({ pattern: buildToolPattern(runner, spec.tool), category: spec.category, suggestion: spec.suggestion });
            }
        }
        if (spec.runners.includes('direct')) {
            for (const runner of DIRECT_RUNNERS) {
                rules.push({ pattern: buildToolPattern(runner, spec.tool), category: spec.category, suggestion: spec.suggestion });
            }
        }
        if (spec.runners.includes('bare')) {
            rules.push({ pattern: buildToolPattern('', spec.tool), category: spec.category, suggestion: spec.suggestion });
        }
    }
    for (const spec of BLOCKED_SCRIPTS) {
        for (const runner of SCRIPT_RUNNERS) {
            rules.push({ pattern: buildToolPattern(runner, spec.script), category: spec.category, suggestion: spec.suggestion });
        }
    }
    rules.push({ pattern: /^doppler run/, category: 'unknown', suggestion: ENV_HINT }, { pattern: /^DATABASE_URL=/, category: 'unknown', suggestion: ENV_HINT }, { pattern: /^pnpm exec\b/, category: 'unknown', suggestion: JUST_TASK_TARGET_HINT }, { pattern: /^pnpm run\b/, category: 'unknown', suggestion: JUST_TASK_TARGET_HINT }, { pattern: /^npm exec\b/, category: 'unknown', suggestion: JUST_TASK_TARGET_HINT }, { pattern: /^npm run\b/, category: 'unknown', suggestion: JUST_TASK_TARGET_HINT }, { pattern: /^bun run\b/, category: 'unknown', suggestion: JUST_TASK_TARGET_HINT }, { pattern: /^npx\b/, category: 'unknown', suggestion: JUST_TASK_TARGET_HINT }, { pattern: /^pnpx\b/, category: 'unknown', suggestion: JUST_TASK_TARGET_HINT }, { pattern: /^bunx\b/, category: 'unknown', suggestion: JUST_TASK_TARGET_HINT });
    return rules;
}
export const COMMAND_RULES = generateRules();
export const SUGGESTION_MODIFIERS = [
    { pattern: /--fix-dangerous|--write.*--unsafe|--unsafe.*--write/, category: 'lint', suggestion: `${LINT_BASE} --fix-unsafe` },
    { pattern: /--fix|--write/, category: 'lint', suggestion: `${LINT_BASE} --fix` },
];
const COMMAND_DELIMITER_REGEX = /(?:&&|\|\||\||;)/;
const LOGICAL_OPERATOR_REGEX = /(?:&&|\|\||;)/;
export function findMatchingRule(command) {
    for (const variant of getCommandVariants(command)) {
        const rule = COMMAND_RULES.find((r) => r.pattern.test(variant));
        if (rule)
            return rule;
    }
    return undefined;
}
export function applySuggestionModifiers(command, rule) {
    for (const modifier of SUGGESTION_MODIFIERS) {
        if (modifier.category === rule.category && modifier.pattern.test(command))
            return modifier.suggestion;
    }
    return rule.suggestion;
}
export function getJustEquivalent(command) {
    const rule = findMatchingRule(command);
    if (!rule)
        return 'just <appropriate-recipe>';
    return applySuggestionModifiers(command, rule);
}
export function getCommandVariants(command) {
    const normalized = command.trim();
    const variants = normalized ? [normalized] : [];
    if (normalized.startsWith('just ')) {
        const logicalSegments = normalized.split(LOGICAL_OPERATOR_REGEX).map((s) => s.trim()).filter(Boolean);
        for (const segment of logicalSegments) {
            const beforePipe = segment.split(/\s*\|\s*/)[0]?.trim();
            if (beforePipe && beforePipe !== segment && !variants.includes(beforePipe))
                variants.push(beforePipe);
            if (segment !== normalized && !variants.includes(segment))
                variants.push(segment);
        }
    }
    else {
        const segments = normalized.split(COMMAND_DELIMITER_REGEX).map((s) => s.trim()).filter(Boolean);
        for (const segment of segments) {
            if (!variants.includes(segment))
                variants.push(segment);
        }
    }
    return variants;
}
export function getCommandCategory(command) {
    return findMatchingRule(command)?.category ?? 'unknown';
}
export function createBlockedResult(command, rule) {
    const suggestion = applySuggestionModifiers(command, rule);
    return {
        validator: VALIDATOR_NAME,
        passed: false,
        message: `"${command}" → Use: ${suggestion}`,
        command,
        suggestion,
        category: rule.category,
        docsRef: DOCS_REF,
        matchedPattern: rule.pattern.source,
    };
}
export function createAuditResult(command, rule) {
    const suggestion = applySuggestionModifiers(command, rule);
    return {
        validator: VALIDATOR_NAME,
        passed: true,
        message: `[AUDIT] Would block: "${command}" → ${suggestion}`,
        command,
        suggestion,
        category: rule.category,
        docsRef: DOCS_REF,
        matchedPattern: rule.pattern.source,
    };
}
export function validateForbiddenCommands(input) {
    if (process.env[SKIP_ENV_VAR] === '1')
        return createSkipResult(VALIDATOR_NAME);
    if (!isBashInput(input))
        return createSkipResult(VALIDATOR_NAME, 'Not a Bash command');
    const command = getCommand(input);
    if (!command)
        return createSkipResult(VALIDATOR_NAME, 'No command found');
    const rule = findMatchingRule(command);
    if (rule) {
        if (process.env[AUDIT_MODE_ENV] === '1')
            return createAuditResult(command, rule);
        return createBlockedResult(command, rule);
    }
    return { validator: VALIDATOR_NAME, passed: true };
}
//# sourceMappingURL=forbidden-commands.js.map