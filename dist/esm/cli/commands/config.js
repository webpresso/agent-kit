import { getSecretsConfigPath, readSecretsConfig, runSecretManagerSetup, secretManagerRegistry, writeSecretsConfig, } from '@webpresso/runtime/env';
function commandError(message, exitCode = 1) {
    const error = new Error(message);
    error.exitCode = exitCode;
    return error;
}
function isSecretManagerName(value) {
    return value === 'doppler' || value === 'infisical';
}
function writeJson(writer, payload) {
    writer.write(`${JSON.stringify(payload, null, 2)}\n`);
}
function writeLine(writer, message) {
    writer.write(`${message}\n`);
}
async function getStatus(cwd, deps) {
    const path = (deps.getPath ?? getSecretsConfigPath)(cwd);
    const config = (deps.readConfig ?? readSecretsConfig)(cwd);
    if (!config) {
        return {
            configured: false,
            path,
            config: null,
            registered: false,
            detail: 'No secret manager configured.',
        };
    }
    const adapter = (deps.registry ?? secretManagerRegistry).get(config.manager) ?? null;
    if (!adapter) {
        return {
            configured: true,
            path,
            config,
            registered: false,
            detail: `Secret manager "${config.manager}" is not registered.`,
        };
    }
    const availability = await adapter.checkAvailability();
    if (!availability.available) {
        return {
            configured: true,
            path,
            config,
            registered: true,
            available: false,
            authenticated: false,
            detail: availability.detail ?? `${adapter.displayName} CLI is not available.`,
        };
    }
    const auth = await adapter.checkAuthentication({ workspace: config.projectId });
    return {
        configured: true,
        path,
        config,
        registered: true,
        available: true,
        authenticated: auth.authenticated,
        detail: auth.detail,
    };
}
function formatShowMessage(status) {
    if (!status.configured || !status.config) {
        return `No secret manager configured.\nRun: wp config secrets setup`;
    }
    return [
        `manager: ${status.config.manager}`,
        `projectId: ${status.config.projectId}`,
        ...(status.config.projectLabel ? [`projectLabel: ${status.config.projectLabel}`] : []),
        `path: ${status.path}`,
    ].join('\n');
}
function formatStatusMessage(status) {
    if (!status.configured || !status.config) {
        return `configured: no\npath: ${status.path}\naction: run 'wp config secrets setup'`;
    }
    return [
        `configured: yes`,
        `manager: ${status.config.manager}`,
        `projectId: ${status.config.projectId}`,
        `registered: ${status.registered ? 'yes' : 'no'}`,
        `available: ${status.available === true ? 'yes' : 'no'}`,
        `authenticated: ${status.authenticated === true ? 'yes' : 'no'}`,
        `path: ${status.path}`,
        ...(status.detail ? [`detail: ${status.detail}`] : []),
    ].join('\n');
}
export async function runSecretsConfigCommand(action, positional, options = {}, deps = {}) {
    const stdout = deps.stdout ?? process.stdout;
    const stderr = deps.stderr ?? process.stderr;
    const cwd = options.cwd ?? process.cwd();
    switch (action) {
        case 'show': {
            const status = await getStatus(cwd, deps);
            if (options.json)
                writeJson(stdout, status);
            else
                writeLine(stdout, formatShowMessage(status));
            return status.configured ? 0 : 1;
        }
        case 'status': {
            const status = await getStatus(cwd, deps);
            if (options.json)
                writeJson(stdout, status);
            else
                writeLine(stdout, formatStatusMessage(status));
            return status.configured && status.registered && status.available && status.authenticated
                ? 0
                : 1;
        }
        case 'set': {
            const manager = positional[0];
            const projectId = positional[1];
            if (!isSecretManagerName(manager) || !projectId) {
                throw commandError('Usage: wp config secrets set <doppler|infisical> <project-id>');
            }
            const config = {
                manager,
                projectId,
                ...(options.label ? { projectLabel: options.label } : {}),
            };
            (deps.writeConfig ?? writeSecretsConfig)(config, cwd);
            const payload = { ok: true, path: (deps.getPath ?? getSecretsConfigPath)(cwd), config };
            if (options.json)
                writeJson(stdout, payload);
            else
                writeLine(stdout, `Configured ${manager} project ${projectId}`);
            return 0;
        }
        case 'setup': {
            const result = await (deps.setup ?? runSecretManagerSetup)({ cwd });
            const payload = {
                ok: true,
                path: (deps.getPath ?? getSecretsConfigPath)(cwd),
                config: { manager: result.manager, projectId: result.projectId },
            };
            if (options.json)
                writeJson(stdout, payload);
            else
                writeLine(stdout, `Configured ${result.manager} project ${result.projectId}`);
            return 0;
        }
        default:
            stderr.write([
                'Usage: wp config secrets <action> [options]',
                '',
                'Actions:',
                '  setup                           Interactive secret-manager setup',
                '  set <manager> <project-id>      Persist an explicit manager/project selection',
                '  show                            Show the current selection',
                '  status                          Check selection + local CLI auth state',
                '',
                'Options:',
                '  --json                          Print JSON',
                '  --label <label>                 Optional project label for `set`',
            ].join('\n') + '\n');
            return 1;
    }
}
export function registerConfigCommand(cli) {
    cli
        .command('config <scope> [action] [...rest]', 'Repo configuration (supported: secrets)')
        .option('--json', 'Print JSON output')
        .option('--label <label>', 'Optional project label for `config secrets set`')
        .action(async (scope, action, rest, options) => {
        if (scope !== 'secrets') {
            throw commandError(`Unknown config scope: ${scope}. Use 'secrets'.`);
        }
        return runSecretsConfigCommand(action, typeof rest === 'string' ? [rest] : (rest ?? []), {
            json: options.json,
            label: options.label,
        });
    });
}
//# sourceMappingURL=config.js.map