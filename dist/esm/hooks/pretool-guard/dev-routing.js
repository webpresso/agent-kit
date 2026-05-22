const ROUTING_RULES = [
    {
        prefixes: [
            'vp exec markdownlint-cli2',
            'markdownlint-cli2',
            'pnpm exec markdownlint-cli2',
        ],
        guidanceType: 'qa',
        guidance: 'Use wp_qa MCP tool instead — QA is the blessed MCP quality entrypoint; avoid ad hoc markdown-only lint endpoints',
        tool: 'wp_qa',
    },
    {
        prefixes: [
            'vp exec vitest',
            'vitest',
            'vp run test',
            'vp test',
            'pnpm test',
            'pnpm run test',
            'pnpm exec vitest',
            'just test',
        ],
        guidanceType: 'test',
        guidance: 'Use wp_test MCP tool instead — returns {passed, summary} not raw logs',
        tool: 'wp_test',
    },
    {
        prefixes: [
            'vp exec oxlint',
            'oxlint',
            'pnpm exec oxlint',
            'vp run lint',
            'vp lint',
            'pnpm lint',
            'pnpm run lint',
            'just lint',
        ],
        guidanceType: 'lint',
        guidance: 'Use wp_lint MCP tool instead — returns {passed, violations[]}',
        tool: 'wp_lint',
    },
    {
        prefixes: ['vp exec tsc', 'tsc', 'pnpm exec tsc', 'vp run typecheck', 'pnpm run typecheck'],
        guidanceType: 'typecheck',
        guidance: 'Use wp_typecheck MCP tool instead — returns {passed, errors[]}',
        tool: 'wp_typecheck',
    },
    {
        prefixes: ['vp exec prettier', 'prettier', 'pnpm exec prettier'],
        guidanceType: 'format',
        guidance: 'Use wp_format MCP tool instead — routes through the repo formatter, not Prettier',
        tool: 'wp_format',
    },
    {
        prefixes: ['vp run e2e', 'vp e2e', 'pnpm run e2e', 'pnpm e2e', 'pnpm exec playwright', 'pnpm exec playwright test'],
        guidanceType: 'e2e',
        guidance: 'Use wp_e2e MCP tool instead — returns {passed, summary} for e2e workflow execution',
        tool: 'wp_e2e',
    },
    {
        prefixes: [
            'just qa',
            'pnpm run qa',
            'vp run qa',
            'pnpm qa',
            'vp run lint-md',
            'pnpm run lint-md',
            'just lint-md',
            'pnpm exec markdownlint-cli2',
        ],
        guidanceType: 'qa',
        guidance: 'Use wp_qa MCP tool instead — QA is the blessed MCP quality entrypoint; avoid ad hoc markdown-only lint endpoints',
        tool: 'wp_qa',
    },
];
const PASSTHROUGH_PREFIXES = ['wp audit'];
const SAFE_PASSTHROUGH_PREFIXES = [
    'git status',
    'git add',
    'git commit',
    'git push',
    'ls',
    'mkdir',
    'mv',
    'rm ',
    'echo',
];
const SANDBOX_PREFIXES = [
    { prefix: 'grep', guidance: 'Use ctx_batch_execute for large outputs' },
    { prefix: 'find', guidance: 'Use ctx_batch_execute for large outputs' },
    { prefix: 'cat', guidance: 'Use ctx_execute or ctx_batch_execute for large outputs' },
    { prefix: 'tail', guidance: 'Use ctx_execute or ctx_batch_execute for large outputs' },
    { prefix: 'head', guidance: 'Use ctx_execute or ctx_batch_execute for large outputs' },
    { prefix: 'curl', guidance: 'Use ctx_execute or ctx_fetch_and_index' },
    { prefix: 'wget', guidance: 'Use ctx_execute or ctx_fetch_and_index' },
    { prefix: 'git log', guidance: 'Use ctx_execute_file or ctx_execute' },
    { prefix: 'git diff', guidance: 'Use ctx_execute_file or ctx_execute' },
    { prefix: 'git show', guidance: 'Use ctx_execute_file or ctx_execute' },
    { prefix: 'vp run build', guidance: 'Use ctx_execute for build output' },
];
const VP_SCOPE_FLAG_PREFIX = /(?:(?:--filter|-F|--dir|-C)\s+(?:"[^"]+"|'[^']+'|\S+)|(?:--workspace-root|-w))/u;
const PNPM_SCOPE_FLAG_PREFIX = /(?:(?:--filter|-F|--dir|-C)\s+(?:"[^"]+"|'[^']+'|\S+)|--workspace-root|-w|--recursive|-r|--workspace)(?=\s|$)/u;
const VP_COMMAND_PREFIX = /^vp\s+(?<rest>.+)$/u;
const PNPM_COMMAND_PREFIX = /^pnpm\s+(?<rest>.+)$/u;
export function normalizeCommandForRouting(command) {
    const trimmed = command.trim();
    let match = VP_COMMAND_PREFIX.exec(trimmed);
    let next = trimmed;
    let prefix = 'vp';
    if (match?.groups?.rest) {
        next = match.groups.rest.trim();
    }
    else {
        match = PNPM_COMMAND_PREFIX.exec(trimmed);
        if (match?.groups?.rest) {
            next = match.groups.rest.trim();
            prefix = 'pnpm';
        }
        else {
            return trimmed;
        }
    }
    const scopePrefix = prefix === 'pnpm' ? PNPM_SCOPE_FLAG_PREFIX : VP_SCOPE_FLAG_PREFIX;
    while (scopePrefix.test(next)) {
        const updated = next.replace(scopePrefix, '').trim();
        if (updated === next)
            break;
        next = updated;
    }
    return `${prefix} ${next.replace(/\s+/g, ' ').trim()}`;
}
function matchesPrefix(command, prefix) {
    return command === prefix || command.startsWith(prefix + ' ');
}
export function routeCommand(command, _sessionId) {
    const trimmed = normalizeCommandForRouting(command);
    if (!trimmed)
        return null;
    // Explicit passthroughs (audits, safe git/nav commands)
    for (const prefix of PASSTHROUGH_PREFIXES) {
        if (matchesPrefix(trimmed, prefix))
            return { action: { action: 'passthrough' } };
    }
    for (const prefix of SAFE_PASSTHROUGH_PREFIXES) {
        if (matchesPrefix(trimmed, prefix))
            return { action: { action: 'passthrough' } };
    }
    // Dev-workflow deny rules fire first (priority)
    for (const rule of ROUTING_RULES) {
        for (const prefix of rule.prefixes) {
            if (matchesPrefix(trimmed, prefix)) {
                return {
                    action: { action: 'deny', tool: rule.tool, guidance: rule.guidance },
                };
            }
        }
    }
    // Sandbox rules (data-heavy commands → context-mode)
    for (const { prefix, guidance } of SANDBOX_PREFIXES) {
        if (matchesPrefix(trimmed, prefix)) {
            return { action: { action: 'sandbox', guidance } };
        }
    }
    // Unknown — null (let callers decide)
    return null;
}
//# sourceMappingURL=dev-routing.js.map