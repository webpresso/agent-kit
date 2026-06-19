import { buildPublicCiActCommand, sanitizePublicCiActArgv, } from '#ci/act-runner.js';
import { redactText } from '#mcp/tools/_shared/redact.js';
import { runSecretGateCommand } from '#secret-gate/runner.js';
export const DEFAULT_CI_ACT_TIMEOUT_MS = 20 * 60_000;
export const MAX_CI_ACT_TIMEOUT_MS = 60 * 60_000;
export const CI_COMMAND_HELP = [
    'Run repository CI helpers through the portable, secret-safe wp surface.',
    'Configure secret access with `wp config secrets ...`; execution shells through `with-secrets -- <cmd>`.',
    '',
    'Examples:',
    '  wp ci act --workflow ci-e2e',
    '  wp ci act --workflow ci-e2e --execute',
    '  wp ci act --workflow-path .github/workflows/ci.yml --job test',
].join('\n');
export function registerCiCommand(cli) {
    cli
        .command('ci <action>', CI_COMMAND_HELP)
        .option('--workflow <id>', 'Workflow id or path; bare ids resolve under .github/workflows/', {
        default: 'ci-e2e',
    })
        .option('--workflow-path <path>', 'Explicit workflow file path')
        .option('--job <id>', 'Workflow job id')
        .option('--event-name <name>', 'act event name: pull_request | push | workflow_dispatch')
        .option('--event-path <path>', 'Use an existing event JSON file')
        .option('--env-profile <profile>', 'Secret-gate runtime profile', { default: 'secrets-only' })
        .option('--secret-env-profile <profile>', 'Provider-specific secret manager environment/config selector')
        .option('--container-architecture <arch>', 'act container architecture override')
        .option('--platform-image <image>', 'act runner image for ubicloud-standard-2')
        .option('--timeout-ms <ms>', `act execution timeout in milliseconds (default: ${DEFAULT_CI_ACT_TIMEOUT_MS})`)
        .option('--execute', 'Run act; default is a redacted dry-run preview')
        .option('--dry-run', 'Print the resolved command without executing it')
        .action((action, flags) => {
        if (action !== 'act') {
            process.stderr.write(`Unknown ci action: ${action}. Use 'act'.\n`);
            return 1;
        }
        return runCiActCommand({
            workflow: flags.workflow,
            workflowPath: flags.workflowPath,
            job: flags.job,
            eventName: flags.eventName,
            envProfile: flags.envProfile,
            secretEnvProfile: flags.secretEnvProfile,
            containerArchitecture: flags.containerArchitecture,
            platformImage: flags.platformImage,
            eventPath: flags.eventPath,
            execute: Boolean(flags.execute) && !flags.dryRun,
            timeoutMs: parseCiActTimeoutMs(flags.timeoutMs),
        });
    });
}
export function buildCiActCommand(options = {}, cwd = process.cwd()) {
    const command = buildPublicCiActCommand({ ...options, cwd });
    return { command: command.command, args: command.args };
}
export function validateCiActCommand(..._legacyArgs) {
    return null;
}
export async function runCiActCommand(options = {}, deps = {}) {
    const cwd = deps.cwd ?? process.cwd();
    const command = buildPublicCiActCommand({ ...options, cwd });
    if (!options.execute) {
        const preview = sanitizePublicCiActArgv(command);
        (deps.stdout ?? process.stdout).write(`${JSON.stringify({ command: preview.command, args: preview.args })}\n`);
        return 0;
    }
    const result = await (deps.run ?? runSecretGateCommand)({
        cwd,
        envProfile: options.envProfile,
        secretEnvProfile: options.secretEnvProfile,
        command: 'act',
        args: command.actArgs,
        timeoutMs: normalizeCiActTimeoutMs(options.timeoutMs),
    });
    const stdout = redactText(result.stdout) ?? '';
    const stderr = redactText(result.stderr) ?? '';
    if (stdout)
        (deps.stdout ?? process.stdout).write(stdout);
    if (stderr)
        (deps.stderr ?? process.stderr).write(stderr);
    return result.exitCode;
}
export function normalizeCiActTimeoutMs(value) {
    const timeoutMs = value ?? DEFAULT_CI_ACT_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error('--timeout-ms must be a positive integer');
    }
    if (timeoutMs > MAX_CI_ACT_TIMEOUT_MS) {
        throw new Error(`--timeout-ms must be <= ${MAX_CI_ACT_TIMEOUT_MS}`);
    }
    return timeoutMs;
}
export function parseCiActTimeoutMs(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    const parsed = typeof value === 'number'
        ? value
        : typeof value === 'string'
            ? Number.parseInt(value, 10)
            : Number.NaN;
    return normalizeCiActTimeoutMs(parsed);
}
//# sourceMappingURL=ci.js.map