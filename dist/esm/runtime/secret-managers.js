import { spawnSync } from 'node:child_process';
function formatFailure(provider, command, result) {
    const stderr = result.stderr?.toString().trim() ?? '';
    const stdout = result.stdout?.toString().trim() ?? '';
    const detail = [stderr, stdout].filter(Boolean).join('\n');
    throw new Error(detail.length > 0
        ? `Unable to fetch secrets from ${provider} using \`${command}\`.\n${detail}`
        : `Unable to fetch secrets from ${provider} using \`${command}\`.`);
}
function parseJsonSecrets(provider, text) {
    const trimmed = text.trim();
    if (!trimmed) {
        throw new Error(`${provider} returned an empty response while resolving runtime env.`);
    }
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`${provider} returned invalid JSON while resolving runtime env: ${detail}`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`${provider} returned an unexpected payload while resolving runtime env.`);
    }
    const env = {};
    for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string')
            env[key] = value;
    }
    return env;
}
function fetchFromDoppler(config, options) {
    const args = [
        'secrets',
        'download',
        '--no-file',
        '--format',
        'json',
        '--silent',
        '--project',
        config.projectId,
    ];
    if (options.environment)
        args.push('--config', options.environment);
    const result = spawnSync('doppler', args, {
        cwd: options.cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error || result.status !== 0) {
        formatFailure('Doppler', `doppler ${args.join(' ')}`, result);
    }
    return parseJsonSecrets('Doppler', result.stdout ?? '');
}
function fetchFromInfisical(config, options) {
    const args = [
        'export',
        '--format',
        'json',
        '--silent',
        '--telemetry=false',
        '--expand=false',
        '--projectId',
        config.projectId,
    ];
    if (options.environment)
        args.push(`--env=${options.environment}`);
    const result = spawnSync('infisical', args, {
        cwd: options.cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error || result.status !== 0) {
        formatFailure('Infisical', `infisical ${args.join(' ')}`, result);
    }
    return parseJsonSecrets('Infisical', result.stdout ?? '');
}
export function fetchSecretsForConfig(config, options = {}) {
    switch (config.manager) {
        case 'doppler':
            return fetchFromDoppler(config, options);
        case 'infisical':
            return fetchFromInfisical(config, options);
    }
}
//# sourceMappingURL=secret-managers.js.map