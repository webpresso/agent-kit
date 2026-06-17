import { spawnSync } from 'node:child_process';
import { redactText } from '#mcp/tools/_shared/redact';
const ERROR_DETAIL_MAX_BYTES = 512;
/**
 * Formats a failed secret-manager CLI invocation without exposing secret output.
 *
 * @remarks CLI stdout is deliberately excluded because secret managers may write
 * partial secret payloads to stdout before exiting with a failure.
 * @remarks Only the first stderr line is used; that line is redacted with
 * `redactText` before being truncated to `ERROR_DETAIL_MAX_BYTES` bytes so a
 * token crossing the byte boundary cannot leave an unredacted prefix behind.
 * @remarks The command string is preserved for diagnosability. Project IDs and
 * environment selectors are deployment topology, not secret material.
 */
export function formatFailure(provider, command, result) {
    const firstStderrLine = (result.stderr?.toString() ?? '').trim().split(/\r?\n/, 1)[0] ?? '';
    const redactedFirstLine = redactText(firstStderrLine) ?? '';
    const detail = truncateUtf8Bytes(redactedFirstLine, ERROR_DETAIL_MAX_BYTES);
    throw new Error(detail.length > 0
        ? `Unable to fetch secrets from ${provider} using \`${command}\`.\n${detail}`
        : `Unable to fetch secrets from ${provider} using \`${command}\`.`);
}
function truncateUtf8Bytes(value, maxBytes) {
    let bytes = 0;
    let output = '';
    for (const character of value) {
        const characterBytes = Buffer.byteLength(character, 'utf8');
        if (bytes + characterBytes > maxBytes)
            break;
        bytes += characterBytes;
        output += character;
    }
    return output;
}
export function parseJsonSecrets(provider, text) {
    const trimmed = text.trim();
    if (!trimmed) {
        throw new Error(`${provider} returned an empty response while resolving runtime env.`);
    }
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch {
        // JSON parser messages can echo snippets of the secret-manager stdout payload.
        throw new Error(`${provider} returned invalid JSON while resolving runtime env.`);
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
        // `formatFailure` owns stdout exclusion plus stderr redaction/truncation.
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
        // `formatFailure` owns stdout exclusion plus stderr redaction/truncation.
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