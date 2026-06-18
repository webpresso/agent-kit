import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeRegExp } from '#utils/string';
export function readPackageJson(cwd) {
    const packageJsonPath = join(cwd, 'package.json');
    if (!existsSync(packageJsonPath))
        return;
    try {
        const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            return;
        return parsed;
    }
    catch {
        return;
    }
}
export function getPackageScript(cwd, name) {
    const parsed = readPackageJson(cwd);
    const candidate = parsed?.scripts?.[name];
    return typeof candidate === 'string' ? candidate : undefined;
}
export function packageHasDependency(cwd, dependencyName) {
    const parsed = readPackageJson(cwd);
    if (!parsed)
        return false;
    return ['dependencies', 'devDependencies', 'optionalDependencies'].some((section) => {
        const dependencies = parsed[section];
        return Boolean(dependencies &&
            typeof dependencies === 'object' &&
            !Array.isArray(dependencies) &&
            dependencyName in dependencies);
    });
}
export function packageUsesVitest(cwd) {
    return packageHasDependency(cwd, 'vitest');
}
export function isRecursiveWpScript(script, verb) {
    const normalized = stripLeadingEnvAssignments(script.trim());
    if (!normalized)
        return false;
    const patterns = [
        new RegExp(`^(?:vp\\s+exec\\s+)?wp\\s+${escapeRegExp(verb)}(?:\\s|$)`),
        new RegExp(`^(?:bunx?|npx)\\s+(?:--yes\\s+)?(?:@webpresso/agent-kit\\s+)?wp\\s+${escapeRegExp(verb)}(?:\\s|$)`),
    ];
    return patterns.some((pattern) => pattern.test(normalized));
}
function stripLeadingEnvAssignments(input) {
    let remaining = input.replace(/^env\s+/u, '');
    while (true) {
        const next = remaining.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)/u, '');
        if (next === remaining)
            return remaining.trim();
        remaining = next;
    }
}
//# sourceMappingURL=package-scripts.js.map