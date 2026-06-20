import { isSecretLikeMetadataText, readSecretsConfig, resolveSecretsConfigProfileEnvironment, sanitizeSecretsMetadataText, } from '#runtime/secrets-config.js';
function isSafeMetadataText(value) {
    return !isSecretLikeMetadataText(value);
}
function writeLine(writer, message) {
    writer.write(`${message}\n`);
}
function writeReport(writer, report, json) {
    if (json) {
        writeLine(writer, JSON.stringify(report, null, 2));
        return;
    }
    if (!report.ok) {
        writeLine(writer, report.error ?? 'Secret configuration is not ready.');
        return;
    }
    writeLine(writer, 'configured: yes');
    writeLine(writer, `manager: ${report.manager}`);
    writeLine(writer, `projectId: ${report.projectId}`);
    if (report.profile)
        writeLine(writer, `profile: ${report.profile}`);
    if (report.environment)
        writeLine(writer, `environment: ${report.environment}`);
}
export async function runSecretsDoctorCommand(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const profile = options.profile?.trim() || 'preview';
    const reportProfile = isSafeMetadataText(profile) ? profile : undefined;
    const stdout = options.stdout ?? process.stdout;
    try {
        const config = readSecretsConfig(cwd);
        if (!config) {
            const report = {
                ok: false,
                configured: false,
                error: 'No secret manager configured. Run: wp config secrets setup',
            };
            writeReport(stdout, report, options.json);
            return 1;
        }
        const environment = resolveSecretsConfigProfileEnvironment(profile, cwd);
        const report = {
            ok: true,
            configured: true,
            manager: config.manager,
            projectId: config.projectId,
            ...(config.projectLabel ? { projectLabel: config.projectLabel } : {}),
            profile: reportProfile,
            environment,
        };
        writeReport(stdout, report, options.json);
        return 0;
    }
    catch (error) {
        const report = {
            ok: false,
            configured: false,
            ...(reportProfile ? { profile: reportProfile } : {}),
            error: sanitizeSecretsMetadataText(error instanceof Error ? error.message : String(error)),
        };
        writeReport(stdout, report, options.json);
        return 1;
    }
}
export async function runSecretsCommand(action, options = {}) {
    switch (action) {
        case 'doctor':
            return runSecretsDoctorCommand(options);
        default:
            throw new Error('Usage: wp secrets doctor --profile <profile> [--json]');
    }
}
export function registerSecretsCommand(cli) {
    cli
        .command('secrets <action>', 'Secret orchestration commands (doctor)')
        .option('--profile <profile>', 'Secret profile to validate')
        .option('--json', 'Print JSON output')
        .action(async (action, options) => runSecretsCommand(action, options));
}
//# sourceMappingURL=secrets.js.map