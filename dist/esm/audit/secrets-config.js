import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseSecretsConfigMetadata, SECRETS_CONFIG_PATH } from './lib/secrets-policy.js';
function resolveGitTopLevel(cwd) {
    try {
        const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return out || null;
    }
    catch {
        return null;
    }
}
function resolveConfigPath(cwd) {
    const gitRoot = resolveGitTopLevel(cwd);
    if (gitRoot)
        return join(gitRoot, SECRETS_CONFIG_PATH);
    let current = resolve(cwd);
    while (true) {
        const candidate = join(current, SECRETS_CONFIG_PATH);
        if (existsSync(candidate))
            return candidate;
        const parent = dirname(current);
        if (parent === current)
            return join(resolve(cwd), SECRETS_CONFIG_PATH);
        current = parent;
    }
}
export function auditSecretsConfig(rootDirectory = process.cwd()) {
    const configPath = resolveConfigPath(rootDirectory);
    if (!existsSync(configPath)) {
        return { ok: true, title: 'secrets-config', checked: 0, violations: [] };
    }
    const violations = [];
    try {
        parseSecretsConfigMetadata(readFileSync(configPath, 'utf8'), SECRETS_CONFIG_PATH);
    }
    catch (error) {
        violations.push({
            file: SECRETS_CONFIG_PATH,
            message: error instanceof Error ? error.message : String(error),
        });
    }
    return { ok: violations.length === 0, title: 'secrets-config', checked: 1, violations };
}
//# sourceMappingURL=secrets-config.js.map