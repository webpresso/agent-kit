import { resolve } from 'node:path';
import { buildSecretGateCommand } from '#secret-gate/runner.js';
const DEFAULT_WORKFLOW = 'ci-e2e';
const DEFAULT_PLATFORM_IMAGE = 'ghcr.io/catthehacker/ubuntu:full-latest';
export function resolveCiActWorkflowPath(options = {}) {
    if (options.workflowPath && options.workflowPath.trim().length > 0)
        return options.workflowPath;
    const workflow = (options.workflow ?? DEFAULT_WORKFLOW).trim();
    if (workflow.includes('/') || workflow.endsWith('.yml') || workflow.endsWith('.yaml'))
        return workflow;
    return `.github/workflows/${workflow}.yml`;
}
export function buildPublicCiActArgs(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const args = [
        options.eventName ?? 'pull_request',
        '-W',
        resolve(cwd, resolveCiActWorkflowPath(options)),
        '-P',
        `ubicloud-standard-2=${options.platformImage ?? DEFAULT_PLATFORM_IMAGE}`,
        '--rm',
    ];
    pushOption(args, '-j', options.job);
    pushOption(args, '-e', options.eventPath ? resolve(cwd, options.eventPath) : undefined);
    pushOption(args, '--container-architecture', options.containerArchitecture ?? 'linux/amd64');
    return args;
}
export function buildPublicCiActCommand(options = {}) {
    const actArgs = buildPublicCiActArgs(options);
    const wrapped = buildSecretGateCommand({
        runner: 'with-secrets',
        envProfile: options.envProfile ?? 'secrets-only',
        command: 'act',
        args: actArgs,
    });
    return { command: wrapped.command, args: wrapped.args, actArgs };
}
export function sanitizePublicCiActArgv(command) {
    return {
        command: command.command,
        args: command.args.map(sanitizeArg),
        actArgs: command.actArgs.map(sanitizeArg),
    };
}
export function assertNoForbiddenCiActArgs(args) {
    const forbidden = [
        '--chef-token',
        '--secret',
        '-s',
        '--secret-file',
        '--env-file',
        '--bind',
        '--volume',
        '-v',
        '--container-options',
    ];
    const found = args.find((arg) => forbidden.includes(arg) || forbidden.some((flag) => arg.startsWith(`${flag}=`)));
    if (found)
        throw new Error(`Unsupported unsafe ci act argument: ${found}`);
}
function pushOption(args, flag, value) {
    if (value === undefined || value === '')
        return;
    args.push(flag, String(value));
}
function sanitizeArg(value) {
    if (/wp-ci-act-[^/\\]+[/\\]secrets\.env$/u.test(value))
        return '[INTERNAL_SECRET_FILE]';
    return value;
}
//# sourceMappingURL=act-runner.js.map