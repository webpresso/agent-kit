import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fetchSecretsForConfig } from './secret-managers.js';
import { isDirectRuntimeProfile, isRuntimeProfile } from './profiles.js';
import { readSecretsConfig } from './secrets-config.js';
export function createRuntimeEnvCache() {
    return { values: new Map() };
}
export function buildRuntimeProcessEnv(cwd = process.cwd(), baseEnv = process.env, injectedEnv = {}) {
    const localBin = path.join(cwd, 'node_modules', '.bin');
    const currentPath = baseEnv.PATH?.trim();
    const nextPath = currentPath
        ? currentPath.split(path.delimiter).includes(localBin)
            ? currentPath
            : `${localBin}${path.delimiter}${currentPath}`
        : localBin;
    return {
        ...baseEnv,
        ...injectedEnv,
        PATH: nextPath,
    };
}
function normalizeProfileSelector(profile) {
    const trimmed = profile?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
}
function isCanonicalSecretProfile(profile) {
    return profile !== undefined && isRuntimeProfile(profile) && profile !== 'none';
}
function normalizeEnvironmentSelector(environment) {
    const trimmed = environment?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
}
function resolveConfiguredEnvironmentSelector(config, profile, environment) {
    const explicitEnvironment = normalizeEnvironmentSelector(environment);
    if (explicitEnvironment)
        return config.profiles?.[explicitEnvironment]?.environment ?? explicitEnvironment;
    if (!profile)
        return undefined;
    if (isCanonicalSecretProfile(profile))
        return undefined;
    return undefined;
}
export function resolveRuntimeEnvironment(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const profile = normalizeProfileSelector(options.profile);
    if (isDirectRuntimeProfile(profile)) {
        return {};
    }
    const config = readSecretsConfig(cwd);
    if (!config) {
        if (!profile)
            return {};
        throw new Error('No secret profile configured.\nCommit a valid .webpresso/secrets.config.json and run: wp secrets doctor --profile preview --json');
    }
    const cache = options.cache ?? createRuntimeEnvCache();
    const environmentSelector = resolveConfiguredEnvironmentSelector(config, profile, options.environment);
    const cacheKey = `${cwd}::${config.manager}::${config.projectId}::${environmentSelector ?? '<default>'}`;
    const cached = cache.values.get(cacheKey);
    if (cached)
        return { ...cached };
    const resolved = fetchSecretsForConfig(config, { cwd, environment: environmentSelector });
    cache.values.set(cacheKey, resolved);
    return { ...resolved };
}
export function buildRuntimeSpawnOptions(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const cache = options.cache ?? createRuntimeEnvCache();
    const resolvedEnv = resolveRuntimeEnvironment({
        cwd,
        profile: options.profile,
        environment: options.environment,
        env: options.env,
        cache,
    });
    return {
        cwd,
        env: buildRuntimeProcessEnv(cwd, options.env ?? process.env, resolvedEnv),
        cache,
    };
}
export function spawnRuntimeCommandSync(options) {
    const prepared = buildRuntimeSpawnOptions(options);
    return spawnSync(options.command, [...(options.args ?? [])], {
        cwd: prepared.cwd,
        env: prepared.env,
        stdio: options.stdio ?? 'inherit',
        shell: false,
    });
}
export function spawnRuntimeCommand(command, args = [], options = {}) {
    const prepared = buildRuntimeSpawnOptions(options);
    return spawn(command, [...args], {
        cwd: prepared.cwd,
        env: prepared.env,
        stdio: options.stdio ?? 'inherit',
        signal: options.signal,
        detached: process.platform !== 'win32',
        shell: false,
    });
}
//# sourceMappingURL=executor.js.map