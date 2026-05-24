import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
export const CI_COMMAND_HELP = [
    'Run repository CI helpers through the portable wp surface.',
    '',
    'Examples:',
    '  wp ci act --workflow ci-e2e',
    '  wp ci act --workflow ci-e2e --execute',
    '  wp ci act --workflow ci-main --direct',
].join('\n');
const ACT_ADAPTER_PATH = 'apps/scripts/src/ci/act.ts';
const WITH_SECRETS_PATH = 'apps/scripts/src/lib/with-secrets.ts';
export function registerCiCommand(cli) {
    cli
        .command('ci <action>', CI_COMMAND_HELP)
        .option('--workflow <id>', 'Workflow id: ci-e2e | ci-generated-live-validation | ci-main', {
        default: 'ci-e2e',
    })
        .option('--job <id>', 'Override workflow job id')
        .option('--pr-number <n>', 'Pull request number for generated event payload')
        .option('--repo <owner/name>', 'repository.full_name for generated event payload')
        .option('--chef-url <url>', 'CHEF_CI_URL passed to the act container')
        .option('--chef-token <token>', 'CHEF_CI_TOKEN override')
        .option('--allow-local-chef-token', 'Allow deterministic local chef token fallback (default)')
        .option('--allow-host-mutation', 'Pass act --bind so workflow steps can mutate the host checkout (default)')
        .option('--container-architecture <arch>', 'act container architecture override')
        .option('--platform-image <image>', 'act runner image for ubicloud-standard-2')
        .option('--event-path <path>', 'Use an existing event JSON file')
        .option('--execute', 'Run act; default is dry-run')
        .option('--dry-run', 'Print the resolved act command without executing it')
        .option('--direct', 'Debug mode: bypass the repo secret wrapper and call the act adapter directly')
        .action((action, flags) => {
        if (action !== 'act') {
            process.stderr.write(`Unknown ci action: ${action}. Use 'act'.\n`);
            return 1;
        }
        return runCiActCommand({
            workflow: flags.workflow,
            job: flags.job,
            prNumber: flags.prNumber,
            repo: flags.repo,
            chefUrl: flags.chefUrl,
            chefToken: flags.chefToken,
            allowLocalChefToken: flags.allowLocalChefToken !== false,
            allowHostMutation: flags.allowHostMutation !== false,
            containerArchitecture: flags.containerArchitecture,
            platformImage: flags.platformImage,
            eventPath: flags.eventPath,
            execute: Boolean(flags.execute) && !flags.dryRun,
            direct: Boolean(flags.direct),
        });
    });
}
export function buildCiActCommand(options = {}, cwd = process.cwd()) {
    const actPath = resolve(cwd, ACT_ADAPTER_PATH);
    const withSecretsPath = resolve(cwd, WITH_SECRETS_PATH);
    const adapterArgs = ['bun', actPath, '--workflow', options.workflow || 'ci-e2e'];
    pushOption(adapterArgs, '--job', options.job);
    pushOption(adapterArgs, '--pr-number', options.prNumber);
    pushOption(adapterArgs, '--repo', options.repo);
    pushOption(adapterArgs, '--chef-url', options.chefUrl);
    pushOption(adapterArgs, '--chef-token', options.chefToken);
    pushDefaultEnabledFlag(adapterArgs, '--allow-local-chef-token', options.allowLocalChefToken);
    pushDefaultEnabledFlag(adapterArgs, '--allow-host-mutation', options.allowHostMutation);
    pushOption(adapterArgs, '--container-architecture', options.containerArchitecture);
    pushOption(adapterArgs, '--platform-image', options.platformImage);
    pushOption(adapterArgs, '--event-path', options.eventPath);
    adapterArgs.push(options.execute ? '--execute' : '--dry-run');
    if (options.direct) {
        return {
            command: adapterArgs[0],
            args: adapterArgs.slice(1),
        };
    }
    return {
        command: 'bun',
        args: [withSecretsPath, '--env-profile', 'secrets-only', '--', ...adapterArgs, '--no-doppler'],
    };
}
export function validateCiActCommand(cwd = process.cwd(), exists = (path) => existsSync(path), options = {}) {
    if (!exists(resolve(cwd, ACT_ADAPTER_PATH))) {
        return `No repo-local act adapter found at ${ACT_ADAPTER_PATH}. Add that adapter or use act directly in debug mode.`;
    }
    if (!options.direct && !exists(resolve(cwd, WITH_SECRETS_PATH))) {
        return `No repo-local secret wrapper found at ${WITH_SECRETS_PATH}. CI act must run through the repo secret gate by default.`;
    }
    return null;
}
export function runCiActCommand(options = {}, deps = {}) {
    const cwd = deps.cwd ?? process.cwd();
    const validationError = validateCiActCommand(cwd, deps.exists ?? existsSync, {
        direct: options.direct,
    });
    if (validationError) {
        ;
        (deps.stderr ?? process.stderr).write(`${validationError}\n`);
        return 1;
    }
    const command = buildCiActCommand(options, cwd);
    const result = (deps.run ?? defaultRun)(command.command, command.args);
    if (typeof result.status === 'number')
        return result.status;
    return result.error || result.signal ? 1 : 1;
}
function defaultRun(command, args) {
    return spawnSync(command, [...args], {
        encoding: 'utf8',
        env: process.env,
        stdio: 'inherit',
        windowsHide: true,
    });
}
function pushOption(args, flag, value) {
    if (value === undefined || value === '')
        return;
    args.push(flag, String(value));
}
function pushDefaultEnabledFlag(args, flag, enabled) {
    if (enabled !== false)
        args.push(flag);
}
//# sourceMappingURL=ci.js.map