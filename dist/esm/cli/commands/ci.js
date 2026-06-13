import { buildPublicCiActCommand, sanitizePublicCiActArgv, } from '#ci/act-runner.js';
import { redactText } from '#mcp/tools/_shared/redact.js';
import { runSecretGateCommand } from '#secret-gate/runner.js';
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
        .option('--env-profile <profile>', 'Secret-gate env profile', { default: 'secrets-only' })
        .option('--container-architecture <arch>', 'act container architecture override')
        .option('--platform-image <image>', 'act runner image for ubicloud-standard-2')
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
            containerArchitecture: flags.containerArchitecture,
            platformImage: flags.platformImage,
            eventPath: flags.eventPath,
            execute: Boolean(flags.execute) && !flags.dryRun,
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
        command: 'act',
        args: command.actArgs,
        timeoutMs: options.timeoutMs,
    });
    const stdout = redactText(result.stdout) ?? '';
    const stderr = redactText(result.stderr) ?? '';
    if (stdout)
        (deps.stdout ?? process.stdout).write(stdout);
    if (stderr)
        (deps.stderr ?? process.stderr).write(stderr);
    return result.exitCode;
}
//# sourceMappingURL=ci.js.map