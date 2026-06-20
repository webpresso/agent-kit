import { resolve } from 'node:path';
import { buildSecretGateCommand } from '#secret-gate/runner.js';
import { resolveSecretsConfigProfileEnvironment } from '#runtime/secrets-config.js';
import { createReplayWorkflow, GENERATED_REPLAY_WORKFLOW_PLACEHOLDER, } from './act-replay.js';
export { GENERATED_REPLAY_WORKFLOW_PLACEHOLDER } from './act-replay.js';
const DEFAULT_WORKFLOW = 'ci-e2e';
export const DEFAULT_PLATFORM_IMAGE = 'ghcr.io/catthehacker/ubuntu:full-latest';
const DEFAULT_PLATFORM_IMAGE_SUPPORTED_ARCHITECTURES = new Set(['linux/amd64', 'linux/arm64']);
export function resolveDefaultContainerArchitecture(platform = process.platform, arch = process.arch) {
    return platform === 'darwin' && arch === 'arm64' ? 'linux/arm64' : 'linux/amd64';
}
export function assertSupportedDefaultPlatformImageArchitecture(platformImage, containerArchitecture) {
    if (platformImage !== DEFAULT_PLATFORM_IMAGE) {
        return;
    }
    if (DEFAULT_PLATFORM_IMAGE_SUPPORTED_ARCHITECTURES.has(containerArchitecture)) {
        return;
    }
    throw new Error(`Unsupported container architecture "${containerArchitecture}" for default act image ${DEFAULT_PLATFORM_IMAGE}. Supported architectures: linux/amd64, linux/arm64.`);
}
export function resolveCiActWorkflowPath(options = {}) {
    if (options.workflowPath && options.workflowPath.trim().length > 0)
        return options.workflowPath;
    const workflow = (options.workflow ?? DEFAULT_WORKFLOW).trim();
    if (workflow.includes('/') || workflow.endsWith('.yml') || workflow.endsWith('.yaml'))
        return workflow;
    return `.github/workflows/${workflow}.yml`;
}
export function resolveCiActExecutionMode(options = {}) {
    return options.mode === 'replay' ? 'replay' : 'direct';
}
export function buildPublicCiActArgs(options = {}, workflowPathOverride) {
    const cwd = options.cwd ?? process.cwd();
    const platformImage = options.platformImage ?? DEFAULT_PLATFORM_IMAGE;
    const containerArchitecture = options.containerArchitecture ?? resolveDefaultContainerArchitecture();
    assertSupportedDefaultPlatformImageArchitecture(platformImage, containerArchitecture);
    const args = [
        options.eventName ?? 'pull_request',
        '-W',
        workflowPathOverride ?? resolve(cwd, resolveCiActWorkflowPath(options)),
        '-P',
        `ubicloud-standard-2=${platformImage}`,
        '--rm',
    ];
    pushOption(args, '-j', options.job);
    pushOption(args, '-e', options.eventPath ? resolve(cwd, options.eventPath) : undefined);
    pushOption(args, '--container-architecture', containerArchitecture);
    return args;
}
export function buildPublicCiActCommand(options = {}) {
    const workflowPathOverride = resolveCiActExecutionMode(options) === 'replay'
        ? GENERATED_REPLAY_WORKFLOW_PLACEHOLDER
        : undefined;
    const actArgs = buildPublicCiActArgs(options, workflowPathOverride);
    const secretEnvProfile = resolveCiActSecretEnvProfile(options);
    const wrapped = buildSecretGateCommand({
        runner: 'with-secrets',
        envProfile: options.envProfile ?? 'secrets-only',
        secretEnvProfile,
        command: 'act',
        args: actArgs,
    });
    return { command: wrapped.command, args: wrapped.args, actArgs };
}
export function preparePublicCiActExecution(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const mode = resolveCiActExecutionMode(options);
    const replay = mode === 'replay'
        ? createReplayWorkflow({
            cwd,
            workflowPath: resolveCiActWorkflowPath(options),
            eventName: options.eventName ?? 'pull_request',
        })
        : null;
    const actArgs = buildPublicCiActArgs({ ...options, cwd }, replay ? replay.workflowPath : undefined);
    const secretEnvProfile = resolveCiActSecretEnvProfile({ ...options, cwd });
    const wrapped = buildSecretGateCommand({
        runner: 'with-secrets',
        envProfile: options.envProfile ?? 'secrets-only',
        secretEnvProfile,
        command: 'act',
        args: actArgs,
    });
    return {
        command: { command: wrapped.command, args: wrapped.args, actArgs },
        mode,
        nonSecurityEquivalent: mode === 'replay',
        cleanup() {
            replay?.cleanup();
        },
    };
}
export function resolveCiActSecretEnvProfile(options = {}) {
    const secretEnvProfile = options.secretEnvProfile?.trim();
    if (secretEnvProfile) {
        return secretEnvProfile;
    }
    const secretProfile = options.secretProfile?.trim();
    if (secretProfile) {
        return resolveSecretsConfigProfileEnvironment(secretProfile, options.cwd);
    }
    return undefined;
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
    if (/wp-ci-act-replay-[^/\\]+[/\\]workflow\.yml$/u.test(value)) {
        return GENERATED_REPLAY_WORKFLOW_PLACEHOLDER;
    }
    return value;
}
//# sourceMappingURL=act-runner.js.map