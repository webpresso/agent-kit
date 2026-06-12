import { spawnSync } from 'node:child_process';
function defaultWhich(cmd) {
    const result = spawnSync('which', [cmd], { encoding: 'utf8' });
    return result.status === 0;
}
function detect(env, which) {
    const isClaudeEnv = env['CLAUDE_CODE'] !== undefined || env['ANTHROPIC_API_KEY'] !== undefined;
    if (isClaudeEnv && !which('codex')) {
        return 'claude-subagent';
    }
    if (which('codex')) {
        return 'codex-exec';
    }
    return 'local-worktree';
}
function assertAllowed(candidate, task) {
    const { runners } = task;
    if (runners === undefined || runners.length === 0) {
        return;
    }
    if (!runners.includes(candidate)) {
        throw new Error(`Runner ${candidate} not in task's allowed runners: ${runners.join(', ')}`);
    }
}
export function selectRunner(task, opts) {
    const env = opts?.env ?? process.env;
    const which = opts?.which ?? defaultWhich;
    let candidate;
    if (opts?.runner !== undefined) {
        candidate = opts.runner;
    }
    else {
        candidate = detect(env, which);
    }
    assertAllowed(candidate, task);
    return candidate;
}
//# sourceMappingURL=select.js.map