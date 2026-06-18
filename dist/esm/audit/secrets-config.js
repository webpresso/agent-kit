import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSecretsConfigMetadata, SECRETS_CONFIG_PATH } from './lib/secrets-policy.js';
export function auditSecretsConfig(rootDirectory = process.cwd()) {
    const configPath = join(rootDirectory, SECRETS_CONFIG_PATH);
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