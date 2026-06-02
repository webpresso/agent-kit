import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
const localRequire = createRequire(import.meta.url);
function findNearestPackageRoot(startDirectory) {
    let directory = resolve(startDirectory);
    while (true) {
        if (existsSync(join(directory, 'package.json'))) {
            return directory;
        }
        const parent = dirname(directory);
        if (parent === directory) {
            return undefined;
        }
        directory = parent;
    }
}
function resolvePackageRootFromConfigArg(argv) {
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (!arg)
            continue;
        const configPath = arg === '--config' || arg === '-c'
            ? argv[index + 1]
            : arg.startsWith('--config=')
                ? arg.slice('--config='.length)
                : undefined;
        if (!configPath)
            continue;
        return findNearestPackageRoot(dirname(resolve(configPath)));
    }
    return undefined;
}
function resolveConsumerPackageRoot() {
    const npmPackageJson = process.env.npm_package_json;
    if (npmPackageJson) {
        const npmPackageRoot = findNearestPackageRoot(dirname(resolve(npmPackageJson)));
        if (npmPackageRoot)
            return npmPackageRoot;
    }
    const configPackageRoot = resolvePackageRootFromConfigArg(process.argv);
    if (configPackageRoot)
        return configPackageRoot;
    return findNearestPackageRoot(process.cwd());
}
export const consumerPackageRoot = resolveConsumerPackageRoot();
const consumerPackageJsonPath = consumerPackageRoot
    ? join(consumerPackageRoot, 'package.json')
    : undefined;
export const requireFromConsumer = consumerPackageJsonPath
    ? createRequire(consumerPackageJsonPath)
    : localRequire;
export function readConsumerPackageJson() {
    if (!consumerPackageJsonPath)
        return undefined;
    try {
        return JSON.parse(readFileSync(consumerPackageJsonPath, 'utf8'));
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=consumer-package.js.map