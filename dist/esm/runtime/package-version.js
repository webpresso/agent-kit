import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ACCEPTED_PACKAGE_PREFIXES = ['@webpresso/agent-kit'];
const MAX_UPWARD_LEVELS = 8;
function matchesOwnedPackageName(name) {
    return (typeof name === 'string' &&
        ACCEPTED_PACKAGE_PREFIXES.some((prefix) => name === prefix || name.startsWith(`${prefix}-`)));
}
function readVersionFromDir(startDir) {
    let dir = path.resolve(startDir);
    for (let i = 0; i < MAX_UPWARD_LEVELS; i++) {
        const candidate = path.join(dir, 'package.json');
        if (existsSync(candidate)) {
            try {
                const parsed = JSON.parse(readFileSync(candidate, 'utf8'));
                if (matchesOwnedPackageName(parsed.name) && typeof parsed.version === 'string') {
                    return parsed.version;
                }
            }
            catch {
                // keep walking
            }
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return null;
}
export function readOwnedPackageVersion(moduleUrl) {
    const fromModule = readVersionFromDir(path.dirname(fileURLToPath(moduleUrl)));
    if (fromModule)
        return fromModule;
    if (process.execPath) {
        const fromExec = readVersionFromDir(path.dirname(process.execPath));
        if (fromExec)
            return fromExec;
    }
    return '0.0.0';
}
//# sourceMappingURL=package-version.js.map