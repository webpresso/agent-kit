import { closeSync, openSync } from 'node:fs';
import { O_CREAT, O_EXCL, O_WRONLY } from 'node:constants';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const ROUTING_RULES = [
    {
        prefixes: [
            'just qa',
            'pnpm qa',
            'pnpm run qa',
            'vp exec markdownlint-cli2',
            'just lint-md',
            'pnpm exec markdownlint-cli2',
            'markdownlint-cli2',
        ],
        guidanceType: 'qa',
        guidance: 'Use ak_qa MCP tool instead — QA is the blessed MCP quality entrypoint; avoid ad hoc markdown-only lint endpoints',
        tool: 'ak_qa',
    },
    {
        prefixes: [
            'just test',
            'pnpm test',
            'pnpm run test',
            'pnpm exec vitest',
            'vp exec vitest',
            'vitest',
        ],
        guidanceType: 'test',
        guidance: 'Use ak_test MCP tool instead — returns {passed, summary} not raw logs',
        tool: 'ak_test',
    },
    {
        prefixes: [
            'just lint',
            'pnpm lint',
            'pnpm run lint',
            'pnpm exec oxlint',
            'vp exec oxlint',
            'oxlint',
        ],
        guidanceType: 'lint',
        guidance: 'Use ak_lint MCP tool instead — returns {passed, violations[]}',
        tool: 'ak_lint',
    },
    {
        prefixes: [
            'just typecheck',
            'pnpm typecheck',
            'pnpm run typecheck',
            'pnpm exec tsc',
            'vp exec tsc',
            'tsc',
        ],
        guidanceType: 'typecheck',
        guidance: 'Use ak_typecheck MCP tool instead — returns {passed, errors[]}',
        tool: 'ak_typecheck',
    },
    {
        prefixes: ['pnpm exec prettier', 'vp exec prettier', 'prettier'],
        guidanceType: 'format',
        guidance: 'Use ak_format MCP tool instead — routes through the repo formatter, not Prettier',
        tool: 'ak_format',
    },
];
const PASSTHROUGH_PREFIXES = ['just audit', 'ak audit'];
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
    { prefix: 'npm test', guidance: 'Use ctx_execute for test output' },
    { prefix: 'npm run build', guidance: 'Use ctx_execute for build output' },
    { prefix: 'pnpm build', guidance: 'Use ctx_execute for build output' },
];
const PNPM_DIRECTORY_PREFIX = /^pnpm\s+(?:(?:--dir|-C)\s+(?:"[^"]+"|'[^']+'|\S+)\s+)+(?<rest>.+)$/u;
export function normalizeCommandForRouting(command) {
    const trimmed = command.trim();
    const match = PNPM_DIRECTORY_PREFIX.exec(trimmed);
    const rest = match?.groups?.rest?.trim();
    return rest ? `pnpm ${rest}` : trimmed;
}
function matchesPrefix(command, prefix) {
    return command === prefix || command.startsWith(prefix + ' ');
}
function markerPath(sessionId, guidanceType) {
    const key = sessionId ?? String(process.ppid);
    return join(tmpdir(), `ak-routing-guidance-${key}-${guidanceType}`);
}
function shouldThrottle(sessionId, guidanceType, guidance) {
    const path = markerPath(sessionId, guidanceType);
    try {
        const fd = openSync(path, O_CREAT | O_EXCL | O_WRONLY);
        closeSync(fd);
        return { guidance }; // first time — show guidance
    }
    catch (err) {
        if (err.code === 'EEXIST')
            return null; // already shown this session
        return { guidance }; // non-EEXIST (NFS etc) — always deny
    }
}
export function routeCommand(command, sessionId) {
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
                const throttled = shouldThrottle(sessionId, rule.guidanceType, rule.guidance);
                if (throttled === null) {
                    // Already shown guidance this session — passthrough
                    return { action: { action: 'passthrough' }, throttleKey: rule.guidanceType };
                }
                return {
                    action: { action: 'deny', tool: rule.tool, guidance: rule.guidance },
                    throttleKey: rule.guidanceType,
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