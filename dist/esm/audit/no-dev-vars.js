import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { resolveSecretsAuditRoot } from './lib/secrets-policy.js';
const SKIP_DIRS = new Set(['.git', 'node_modules']);
function isDevVarsOrEnvFile(name) {
    if (name === '.env.example')
        return false;
    if (name === '.dev.vars' || /^\.dev\.vars(?:\..+)?$/u.test(name))
        return true;
    return name === '.env' || (/^\.env(?:\..+)?$/u.test(name) && name !== '.env.example');
}
function walkDir(dir, root, violations) {
    let checked = 0;
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true, encoding: 'utf8' });
    }
    catch {
        return 0;
    }
    for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name))
            continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            checked += walkDir(fullPath, root, violations);
            continue;
        }
        if (!entry.isFile())
            continue;
        checked += 1;
        if (isDevVarsOrEnvFile(entry.name)) {
            const relPath = relative(root, fullPath).replace(/\\/gu, '/');
            violations.push({ file: relPath, message: `forbidden secret file on disk: ${relPath}` });
        }
    }
    return checked;
}
export function auditNoDevVars(rootDirectory = process.cwd()) {
    const auditRoot = resolveSecretsAuditRoot(rootDirectory);
    if (!auditRoot) {
        return { ok: true, title: 'no-dev-vars', checked: 0, violations: [] };
    }
    const violations = [];
    const checked = walkDir(auditRoot, auditRoot, violations);
    return { ok: violations.length === 0, title: 'no-dev-vars', checked, violations };
}
//# sourceMappingURL=no-dev-vars.js.map