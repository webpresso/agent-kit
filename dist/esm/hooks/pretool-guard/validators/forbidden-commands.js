import { readConfig } from '#cli/commands/init/config';
import { getLegalLifecycleTargets, isLegalLifecycleTransition, parseLifecycleBlueprintStatus, } from '#lifecycle/transition-matrix.js';
import { getCommand, isBashInput } from '#hooks/shared/types';
import { AUDIT_KINDS } from '#mcp/tools/_shared/audit-kinds';
import { createSkipResult } from './skip-result.js';
import { buildRedirectMessage } from './mcp-redirect.js';
export const VALIDATOR_NAME = 'forbidden-commands';
export const SKIP_ENV_VAR = 'FORBIDDEN_COMMANDS_SKIP';
export const AUDIT_MODE_ENV = 'FORBIDDEN_COMMANDS_AUDIT';
export const DOCS_REF = 'AGENTS.md "Forbidden Commands (CRITICAL)" section';
const DB_HINT = 'Use the database MCP/tooling entrypoint instead of direct CLI execution';
const BLUEPRINT_HINT = 'wp blueprint new|list|audit — use wp_blueprint MCP tool for lifecycle transitions';
const BLUEPRINT_LIFECYCLE_DIRS = '(draft|planned|in-progress|parked|completed|archived)';
const BLUEPRINT_GIT_MV_RULE = {
    pattern: /^git\s+mv\b/,
    category: 'blueprint',
    suggestion: BLUEPRINT_HINT,
};
const LINT_BASE = 'wp_lint MCP tool with package/file scope';
const LINT_HINT = `${LINT_BASE} [--fix] [--fix-unsafe]`;
const FORMAT_HINT = 'wp_format MCP tool';
const QA_HINT = 'wp_qa MCP tool';
const TEST_HINT = 'wp_test MCP tool with package/file scope';
const MUTATION_HINT = 'wp_test mutation workflow';
const TYPECHECK_HINT = 'wp_typecheck MCP tool with package/file scope';
const E2E_HINT = 'wp_e2e MCP tool';
const ENV_HINT = 'Use the repo-approved environment wrapper for secret-bearing commands';
const TASK_TARGET_HINT = 'Use the repo-approved vp facade or MCP tool instead of raw execution';
const EXEC_RUNNERS = [
    'vp exec',
    'pnpm exec',
    'npm exec',
    'npm exec --',
    'npx',
    'pnpx',
    'yarn exec',
    'yarn dlx',
    'bunx',
];
const DIRECT_RUNNERS = ['vp', 'pnpm', 'yarn', 'yarnpkg'];
const SCRIPT_RUNNERS = ['vp run', 'vp', 'pnpm', 'pnpm run', 'just'];
export const BLOCKED_TOOLS = [
    {
        tool: 'drizzle-kit',
        category: 'unknown',
        suggestion: DB_HINT,
        runners: ['exec', 'direct', 'bare'],
    },
    { tool: 'vitest', category: 'test', suggestion: TEST_HINT, runners: ['exec', 'direct', 'bare'] },
    { tool: 'oxlint', category: 'lint', suggestion: LINT_HINT, runners: ['exec', 'direct', 'bare'] },
    { tool: 'oxfmt', category: 'lint', suggestion: FORMAT_HINT, runners: ['exec', 'direct', 'bare'] },
    {
        tool: 'prettier',
        category: 'format',
        suggestion: FORMAT_HINT,
        runners: ['exec', 'direct', 'bare'],
    },
    { tool: 'stryker', category: 'test', suggestion: MUTATION_HINT, runners: ['exec', 'bare'] },
    {
        tool: 'tsc',
        category: 'typecheck',
        suggestion: TYPECHECK_HINT,
        runners: ['exec', 'direct', 'bare'],
    },
    {
        tool: 'tsgo',
        category: 'typecheck',
        suggestion: TYPECHECK_HINT,
        runners: ['exec', 'direct', 'bare'],
    },
];
export const BLOCKED_SCRIPTS = [
    { script: 'test', category: 'test', suggestion: TEST_HINT },
    { script: 'lint', category: 'lint', suggestion: LINT_HINT },
    { script: 'typecheck', category: 'typecheck', suggestion: TYPECHECK_HINT },
    { script: 'e2e', category: 'e2e', suggestion: E2E_HINT },
    { script: 'qa', category: 'unknown', suggestion: QA_HINT },
];
export const BLOCKED_RAW_NODE_MODULE_TOOLS = [
    { modulePath: 'vitest/vitest.mjs', category: 'test', suggestion: TEST_HINT },
    { modulePath: 'typescript/bin/tsc', category: 'typecheck', suggestion: TYPECHECK_HINT },
    { modulePath: 'oxlint/bin/oxlint', category: 'lint', suggestion: LINT_HINT },
];
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function buildToolPattern(prefix, tool) {
    const escaped = prefix ? `${escapeRegex(prefix)} ${escapeRegex(tool)}` : escapeRegex(tool);
    return new RegExp(`^${escaped}(\\s|$)`);
}
function buildRawNodeModulesToolPattern(modulePath) {
    return new RegExp(`^node\\s+(?:\\.\\/)?node_modules\\/${escapeRegex(modulePath)}(?:\\s|$)`);
}
export function generateRules() {
    const rules = [];
    for (const spec of BLOCKED_TOOLS) {
        if (spec.runners.includes('exec')) {
            for (const runner of EXEC_RUNNERS) {
                rules.push({
                    pattern: buildToolPattern(runner, spec.tool),
                    category: spec.category,
                    suggestion: spec.suggestion,
                });
            }
        }
        if (spec.runners.includes('direct')) {
            for (const runner of DIRECT_RUNNERS) {
                rules.push({
                    pattern: buildToolPattern(runner, spec.tool),
                    category: spec.category,
                    suggestion: spec.suggestion,
                });
            }
        }
        if (spec.runners.includes('bare')) {
            rules.push({
                pattern: buildToolPattern('', spec.tool),
                category: spec.category,
                suggestion: spec.suggestion,
            });
        }
    }
    for (const spec of BLOCKED_SCRIPTS) {
        for (const runner of SCRIPT_RUNNERS) {
            rules.push({
                pattern: buildToolPattern(runner, spec.script),
                category: spec.category,
                suggestion: spec.suggestion,
            });
        }
    }
    for (const spec of BLOCKED_RAW_NODE_MODULE_TOOLS) {
        rules.push({
            pattern: buildRawNodeModulesToolPattern(spec.modulePath),
            category: spec.category,
            suggestion: spec.suggestion,
        });
    }
    rules.push({
        pattern: /^vp exec markdownlint-cli2\b/,
        category: 'unknown',
        suggestion: QA_HINT,
    }, { pattern: /^markdownlint-cli2\b/, category: 'unknown', suggestion: QA_HINT }, {
        pattern: new RegExp(`^mv\\b.*blueprints\\/${BLUEPRINT_LIFECYCLE_DIRS}`),
        category: 'blueprint',
        suggestion: BLUEPRINT_HINT,
    }, {
        pattern: new RegExp(`^mkdir\\b.*blueprints\\/${BLUEPRINT_LIFECYCLE_DIRS}`),
        category: 'blueprint',
        suggestion: BLUEPRINT_HINT,
    }, { pattern: /^doppler run/, category: 'unknown', suggestion: ENV_HINT }, { pattern: /^DATABASE_URL=/, category: 'unknown', suggestion: ENV_HINT }, { pattern: /^vp exec\b/, category: 'unknown', suggestion: TASK_TARGET_HINT }, { pattern: /^vp run\b/, category: 'unknown', suggestion: TASK_TARGET_HINT });
    return rules;
}
export const COMMAND_RULES = generateRules();
export const SUGGESTION_MODIFIERS = [
    {
        pattern: /--fix-dangerous|--write.*--unsafe|--unsafe.*--write/,
        category: 'lint',
        suggestion: `${LINT_BASE} --fix-unsafe`,
    },
    { pattern: /--fix|--write/, category: 'lint', suggestion: `${LINT_BASE} --fix` },
];
const LOGICAL_OPERATOR_REGEX = /(?:&&|\|\||;)/;
const VP_SCOPE_FLAG_REGEX = /\s+(?:(?:--filter|-F|--dir|-C)\s+(?:"[^"]+"|'[^']+'|\S+)|(?:--workspace-root|-w))/;
const PNPM_SCOPE_FLAG_REGEX = /(?:\s+(?:(?:--filter|-F|--dir|-C)\s+(?:"[^"]+"|'[^']+'|\S+)|(?:--workspace-root|-w|--recursive|-r|--workspace))(?=\s|$))/;
function stripVpScopeFlags(command) {
    if (!command.startsWith('vp ')) {
        return command;
    }
    let next = command;
    while (VP_SCOPE_FLAG_REGEX.test(next)) {
        const updated = next.replace(VP_SCOPE_FLAG_REGEX, '');
        if (updated === next) {
            break;
        }
        next = updated;
    }
    return next.replace(/\s+/g, ' ').trim();
}
function stripPnPmScopeFlags(command) {
    if (!command.startsWith('pnpm ')) {
        return command;
    }
    let next = command;
    while (PNPM_SCOPE_FLAG_REGEX.test(next)) {
        const updated = next.replace(PNPM_SCOPE_FLAG_REGEX, '');
        if (updated === next)
            break;
        next = updated.replace(/\s+/g, ' ').trim();
    }
    return next;
}
function stripKnownScopeFlags(command) {
    let normalized = command;
    if (normalized.startsWith('vp ')) {
        normalized = stripVpScopeFlags(normalized);
    }
    else if (normalized.startsWith('pnpm ')) {
        normalized = stripPnPmScopeFlags(normalized);
    }
    return normalized;
}
/**
 * Split a shell command string on top-level operators (&&, ||, |, ;) while
 * correctly skipping operators that appear inside:
 *   - single-quoted strings:  '...'
 *   - double-quoted strings:  "..."
 *   - $(...) command substitutions (handles nesting)
 *   - backtick subshells: `...`
 *
 * This prevents heredoc or subshell content from being mistaken for real
 * command segments (e.g. git commit -m "$(cat <<'EOF'\n...&&...\nEOF\n)").
 */
export function splitTopLevelCommands(command) {
    const segments = [];
    let current = '';
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;
    let i = 0;
    while (i < command.length) {
        const ch = command[i];
        const next = i + 1 < command.length ? command[i + 1] : '';
        if (inSingleQuote) {
            current += ch;
            if (ch === "'")
                inSingleQuote = false;
            i++;
            continue;
        }
        if (inBacktick) {
            current += ch;
            if (ch === '`')
                inBacktick = false;
            i++;
            continue;
        }
        if (depth > 0) {
            if (ch === '$' && next === '(') {
                depth++;
                current += ch + next;
                i += 2;
            }
            else if (ch === ')') {
                depth--;
                current += ch;
                i++;
            }
            else if (ch === "'") {
                inSingleQuote = true;
                current += ch;
                i++;
            }
            else if (ch === '`') {
                inBacktick = true;
                current += ch;
                i++;
            }
            else {
                current += ch;
                i++;
            }
            continue;
        }
        if (inDoubleQuote) {
            if (ch === '"') {
                inDoubleQuote = false;
                current += ch;
                i++;
            }
            else if (ch === '$' && next === '(') {
                depth++;
                current += ch + next;
                i += 2;
            }
            else if (ch === '\\') {
                current += ch + next;
                i += 2;
            }
            else {
                current += ch;
                i++;
            }
            continue;
        }
        // Top-level context — check for operators before recording the character.
        if (ch === "'") {
            inSingleQuote = true;
            current += ch;
            i++;
        }
        else if (ch === '"') {
            inDoubleQuote = true;
            current += ch;
            i++;
        }
        else if (ch === '`') {
            inBacktick = true;
            current += ch;
            i++;
        }
        else if (ch === '$' && next === '(') {
            depth++;
            current += ch + next;
            i += 2;
        }
        else if (ch === '&' && next === '&') {
            const seg = current.trim();
            if (seg)
                segments.push(seg);
            current = '';
            i += 2;
        }
        else if (ch === '|' && next === '|') {
            const seg = current.trim();
            if (seg)
                segments.push(seg);
            current = '';
            i += 2;
        }
        else if (ch === '|') {
            const seg = current.trim();
            if (seg)
                segments.push(seg);
            current = '';
            i++;
        }
        else if (ch === ';') {
            const seg = current.trim();
            if (seg)
                segments.push(seg);
            current = '';
            i++;
        }
        else {
            current += ch;
            i++;
        }
    }
    const last = current.trim();
    if (last)
        segments.push(last);
    return segments;
}
function splitShellArgs(command) {
    return command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
}
function unquoteShellArg(arg) {
    return arg.replace(/^['"]|['"]$/g, '');
}
function extractBlueprintLifecycleStatusFromPathArg(arg) {
    const normalized = unquoteShellArg(arg).replace(/\\/g, '/');
    const match = normalized.match(/(?:^|\/)blueprints\/(draft|planned|in-progress|parked|completed|archived)(?:\/|$)/);
    return parseLifecycleBlueprintStatus(match?.[1] ?? '');
}
function findIllegalBlueprintGitMv(command) {
    for (const segment of splitTopLevelCommands(command.trim())) {
        if (!/^git\s+mv\b/.test(segment))
            continue;
        const args = splitShellArgs(segment);
        if (args.length < 4)
            continue;
        const from = extractBlueprintLifecycleStatusFromPathArg(args[2] ?? '');
        const to = extractBlueprintLifecycleStatusFromPathArg(args[3] ?? '');
        if (!from || !to)
            continue;
        if (isLegalLifecycleTransition(from, to))
            return null;
        return { segment, from, to };
    }
    return null;
}
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
export function getApprovedEquivalent(command) {
    const rule = findMatchingRule(command);
    if (!rule)
        return 'repo-approved MCP/tooling entrypoint';
    return applySuggestionModifiers(command, rule);
}
export function getCommandVariants(command) {
    const normalized = command.trim();
    const variants = normalized ? [normalized] : [];
    if (normalized.startsWith('vp ')) {
        const logicalSegments = normalized
            .split(LOGICAL_OPERATOR_REGEX)
            .map((s) => s.trim())
            .filter(Boolean);
        for (const segment of logicalSegments) {
            const beforePipe = segment.split(/\s*\|\s*/)[0]?.trim();
            if (beforePipe && beforePipe !== segment && !variants.includes(beforePipe))
                variants.push(beforePipe);
            if (segment !== normalized && !variants.includes(segment))
                variants.push(segment);
        }
    }
    else {
        for (const segment of splitTopLevelCommands(normalized)) {
            if (!variants.includes(segment))
                variants.push(segment);
        }
    }
    const initialVariantCount = variants.length;
    for (let index = 0; index < initialVariantCount; index += 1) {
        const variant = variants[index];
        if (!variant)
            continue;
        const strippedVpVariant = stripVpScopeFlags(variant);
        if (strippedVpVariant !== variant && !variants.includes(strippedVpVariant)) {
            variants.push(strippedVpVariant);
        }
        const strippedCommandVariant = stripKnownScopeFlags(variant);
        if (strippedCommandVariant !== variant && !variants.includes(strippedCommandVariant)) {
            variants.push(strippedCommandVariant);
        }
    }
    return variants;
}
export function getCommandCategory(command) {
    return findMatchingRule(command)?.category ?? 'unknown';
}
function loadRedirectConfig() {
    const repoRoot = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    return readConfig(repoRoot)?.mcp;
}
export function createBlockedResult(command, rule, options = {}) {
    const suggestion = applySuggestionModifiers(command, rule);
    return {
        validator: VALIDATOR_NAME,
        passed: false,
        message: buildRedirectMessage({
            category: rule.category,
            command,
            fallbackHint: suggestion,
            ...(options.mcpReady !== undefined ? { mcpReady: options.mcpReady } : {}),
            mcp: options.mcp ?? loadRedirectConfig(),
        }),
        command,
        suggestion,
        category: rule.category,
        docsRef: DOCS_REF,
        matchedPattern: rule.pattern.source,
    };
}
export function createAuditResult(command, rule, options = {}) {
    const suggestion = applySuggestionModifiers(command, rule);
    return {
        validator: VALIDATOR_NAME,
        passed: true,
        message: `[AUDIT] Would block:\n${buildRedirectMessage({
            category: rule.category,
            command,
            fallbackHint: suggestion,
            ...(options.mcpReady !== undefined ? { mcpReady: options.mcpReady } : {}),
            mcp: options.mcp ?? loadRedirectConfig(),
        })}`,
        command,
        suggestion,
        category: rule.category,
        docsRef: DOCS_REF,
        matchedPattern: rule.pattern.source,
    };
}
const AUDIT_KIND_SET = new Set(AUDIT_KINDS);
const WP_AUDIT_RE = /^wp\s+audit\s+([a-z0-9-]+)\b/u;
const SCRIPT_INVOCATION_RE = /^(?:pnpm run|vp run|npm run|pnpm|npm)\s+([A-Za-z0-9:_-]+)/u;
const RAW_PM_RE = /^(?:pnpm|npm)\b/u;
function loadGuardConfig() {
    const repoRoot = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    return readConfig(repoRoot)?.guard;
}
/** Build a guard redirect result; non-blocking ("[AUDIT] Would block") in audit mode. */
function guardRedirect(message) {
    if (process.env[AUDIT_MODE_ENV] === '1') {
        return { validator: VALIDATOR_NAME, passed: true, message: `[AUDIT] Would block:\n${message}` };
    }
    return { validator: VALIDATOR_NAME, passed: false, message };
}
/** `wp audit <kind>` (CLI) → `wp_audit(kind=...)` (MCP). Generic; not gated on config. */
function findWpAuditRedirect(command) {
    for (const variant of getCommandVariants(command)) {
        const kind = WP_AUDIT_RE.exec(variant)?.[1];
        if (kind && AUDIT_KIND_SET.has(kind)) {
            return `"${variant}" denied — use the MCP audit tool: mcp__webpresso__wp_audit(kind="${kind}"). Returns structured, summary-first results.`;
        }
    }
    return undefined;
}
/** Repo-declared `guard.scriptRoutes`: a package script mapped to an audit kind. */
function findScriptRouteRedirect(command, routes) {
    for (const variant of getCommandVariants(command)) {
        const script = SCRIPT_INVOCATION_RE.exec(variant)?.[1];
        if (!script)
            continue;
        const kind = routes[script];
        if (!kind)
            continue;
        if (!AUDIT_KIND_SET.has(kind)) {
            process.stderr.write(`[forbidden-commands] guard.scriptRoutes["${script}"] -> "${kind}" is not a known audit kind; ignoring\n`);
            continue;
        }
        return `"${variant}" denied — this repo routes \`${script}\` to an audit: mcp__webpresso__wp_audit(kind="${kind}").`;
    }
    return undefined;
}
/** `guard.packageManager: 'vp-only'`: route any remaining raw pnpm/npm to the vp facade. */
function findVpOnlyRedirect(command) {
    for (const variant of getCommandVariants(command)) {
        if (RAW_PM_RE.test(variant)) {
            return `"${variant}" denied — this repo is vp-only. Use the vp facade (\`vp install\`, \`vp run <script>\`, \`vp exec <bin>\`) or the matching wp_* MCP tool.`;
        }
    }
    return undefined;
}
export function validateForbiddenCommands(input) {
    if (process.env[SKIP_ENV_VAR] === '1')
        return createSkipResult(VALIDATOR_NAME);
    if (!isBashInput(input))
        return createSkipResult(VALIDATOR_NAME, 'Not a Bash command');
    const command = getCommand(input);
    if (!command)
        return createSkipResult(VALIDATOR_NAME, 'No command found');
    const illegalBlueprintGitMv = findIllegalBlueprintGitMv(command);
    if (illegalBlueprintGitMv) {
        const decoratedRule = {
            ...BLUEPRINT_GIT_MV_RULE,
            suggestion: `${BLUEPRINT_HINT}. Illegal transition ${illegalBlueprintGitMv.from} → ` +
                `${illegalBlueprintGitMv.to}; legal targets: ` +
                `${getLegalLifecycleTargets(illegalBlueprintGitMv.from).join(', ') || '(none)'}`,
        };
        if (process.env[AUDIT_MODE_ENV] === '1')
            return createAuditResult(illegalBlueprintGitMv.segment, decoratedRule);
        return createBlockedResult(illegalBlueprintGitMv.segment, decoratedRule);
    }
    const rule = findMatchingRule(command);
    if (rule) {
        if (process.env[AUDIT_MODE_ENV] === '1')
            return createAuditResult(command, rule);
        return createBlockedResult(command, rule);
    }
    const wpAuditRedirect = findWpAuditRedirect(command);
    if (wpAuditRedirect)
        return guardRedirect(wpAuditRedirect);
    const guard = loadGuardConfig();
    if (guard?.scriptRoutes) {
        const redirect = findScriptRouteRedirect(command, guard.scriptRoutes);
        if (redirect)
            return guardRedirect(redirect);
    }
    if (guard?.packageManager === 'vp-only') {
        const redirect = findVpOnlyRedirect(command);
        if (redirect)
            return guardRedirect(redirect);
    }
    return { validator: VALIDATOR_NAME, passed: true };
}
//# sourceMappingURL=forbidden-commands.js.map