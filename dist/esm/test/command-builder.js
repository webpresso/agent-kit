import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getManagedRunner, resolveOutputPolicy, } from '#tool-runtime';
import { getPackageScript, isRecursiveWpScript } from '#cli/package-scripts.js';
export function buildTestCommand(target, options = {}) {
    if (target.type === 'all' && shouldBypassRecursiveWpTest(options.cwd ?? process.cwd())) {
        return options.mutation ? buildStrykerCommand(options) : buildVitestCommand([], options);
    }
    if (target.type === 'file') {
        return buildVitestCommand(target.values, options);
    }
    return buildVpTestCommand(target.values, options);
}
export function buildVpTestCommand(filters, options = {}) {
    const task = getVpTestTask(options);
    const resolvedFilters = filters.map((filter) => formatVpRunFilter(filter, task));
    const explicitTargets = resolvedFilters.length > 0 && resolvedFilters.every(isExplicitVpTaskTarget);
    const args = ['run', ...resolvedFilters];
    appendVpRunOptions(args, options);
    if (!explicitTargets) {
        args.push(task);
    }
    const passthrough = buildVitestPassthrough(options);
    if (passthrough.length > 0) {
        args.push('--', ...passthrough);
    }
    const resolution = getManagedRunner('vp', {
        outputPolicy: resolveOutputPolicy(options.outputPolicy, options.filterOutput),
    });
    const env = buildVpRunEnv(options);
    const mergedArgs = [...resolution.args, ...args];
    return env
        ? { command: resolution.command, args: mergedArgs, env }
        : { command: resolution.command, args: mergedArgs };
}
export function buildVitestCommand(files, options = {}) {
    const args = [options.watch ? '--watch' : 'run'];
    const configFiles = [];
    const testFiles = [];
    for (const file of files) {
        if (isVitestConfigFile(file)) {
            configFiles.push(file);
        }
        else {
            testFiles.push(file);
        }
    }
    if (configFiles.length > 1) {
        throw new Error(`Expected at most one Vitest config file, received: ${configFiles.join(', ')}`);
    }
    const [configFile] = configFiles;
    if (configFile) {
        args.push('--config', configFile);
    }
    args.push(...buildVitestPassthrough(options), ...testFiles);
    const resolution = getManagedRunner('vitest', {
        outputPolicy: resolveOutputPolicy(options.outputPolicy, options.filterOutput),
    });
    return { command: resolution.command, args: [...resolution.args, ...args] };
}
export function buildStrykerCommand(options = {}) {
    const outputPolicy = resolveOutputPolicy(options.outputPolicy, options.filterOutput);
    const configFile = resolveStrykerConfigFile(options.cwd ?? process.cwd());
    if (isTypeScriptConfigFile(configFile)) {
        const tsxResolution = getManagedRunner('tsx', { outputPolicy });
        const strykerResolution = getManagedRunner('stryker', { outputPolicy: 'structured' });
        return {
            command: tsxResolution.command,
            args: [
                ...tsxResolution.args,
                strykerResolution.command,
                ...strykerResolution.args,
                'run',
                configFile,
            ],
        };
    }
    const resolution = getManagedRunner('stryker', { outputPolicy });
    return {
        command: resolution.command,
        args: [...resolution.args, 'run', configFile],
    };
}
export function getVpTestTask(options) {
    if (options.mutation)
        return 'test:mutation';
    if (options.workers)
        return 'test:workers';
    if (options.watch)
        return 'test:watch';
    return 'test';
}
function appendVpRunOptions(args, options) {
    if (options.noCache) {
        args.push('--no-cache');
    }
    else if (options.cache) {
        args.push('--cache');
    }
    if (options.parallel) {
        args.push('--parallel');
    }
    if (options.concurrencyLimit !== undefined) {
        args.push('--concurrency-limit', String(options.concurrencyLimit));
    }
    if (options.log) {
        args.push('--log', options.log);
    }
}
function buildVpRunEnv(options) {
    if (options.concurrencyLimit === undefined)
        return;
    return { VP_RUN_CONCURRENCY_LIMIT: String(options.concurrencyLimit) };
}
function isExplicitVpTaskTarget(target) {
    return target.includes('#');
}
function formatVpRunFilter(filter, task) {
    if (isExplicitVpTaskTarget(filter)) {
        return filter;
    }
    return filter.startsWith('@') || filter.includes('/') ? `${filter}#${task}` : filter;
}
function buildVitestPassthrough(options) {
    const args = [];
    if (options.coverage)
        args.push('--coverage');
    if (options.testNamePattern)
        args.push('-t', options.testNamePattern);
    if (options.passthrough)
        args.push(...options.passthrough);
    return args;
}
function isVitestConfigFile(file) {
    return /^vitest(?:\.[\w-]+)?\.config\.(?:ts|mts|cts|js|mjs|cjs)$/u.test(file);
}
function shouldBypassRecursiveWpTest(cwd) {
    const testScript = getPackageScript(cwd, 'test');
    return Boolean(testScript && isRecursiveWpScript(testScript, 'test'));
}
function resolveStrykerConfigFile(cwd) {
    for (const candidate of ['stryker.config.ts', 'stryker.config.mjs']) {
        if (existsSync(join(cwd, candidate)))
            return candidate;
    }
    return 'stryker.config.ts';
}
function isTypeScriptConfigFile(configFile) {
    return /\.(?:ts|mts|cts)$/u.test(configFile);
}
//# sourceMappingURL=command-builder.js.map