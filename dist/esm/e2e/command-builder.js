import path from 'node:path';
export function buildE2eCommand(options) {
    switch (options.step.runner) {
        case 'playwright':
            return buildPlaywrightCommand(options);
        case 'vitest':
            return buildVitestE2eCommand(options);
        case 'command':
            return buildCustomCommand(options);
    }
}
function buildPlaywrightCommand(options) {
    const { step } = options;
    if (!step.configPath) {
        throw new Error(`Step ${step.logName} uses runner "playwright" but does not define configPath.`);
    }
    const { baseDir, configArg, files } = resolveRunnerPaths(step.configPath, options.files ?? []);
    const args = [...buildPnpmExecPrefix(baseDir), 'playwright', 'test', '--config', configArg];
    appendPlaywrightFlags(args, options);
    args.push(...(step.fixedArgs ?? []), ...files, ...(options.passthrough ?? []));
    return { command: 'pnpm', args };
}
function buildVitestE2eCommand(options) {
    const { step } = options;
    if (!step.configPath) {
        throw new Error(`Step ${step.logName} uses runner "vitest" but does not define configPath.`);
    }
    const { baseDir, configArg, files } = resolveRunnerPaths(step.configPath, options.files ?? []);
    const args = [...buildPnpmExecPrefix(baseDir), 'vitest', 'run', '--config', configArg];
    if (options.workers !== undefined) {
        args.push('--poolOptions.threads.maxThreads', String(options.workers));
    }
    args.push(...(step.fixedArgs ?? []), ...files, ...(options.passthrough ?? []));
    return { command: 'pnpm', args };
}
function buildCustomCommand(options) {
    const { step } = options;
    const commandArgs = step.commandArgs;
    if (!commandArgs?.length) {
        throw new Error(`Step ${step.logName} uses runner "command" but does not define commandArgs.`);
    }
    return {
        command: commandArgs[0],
        args: [
            ...commandArgs.slice(1),
            ...(step.fixedArgs ?? []),
            ...(options.files ?? []),
            ...(options.passthrough ?? []),
        ],
    };
}
function appendPlaywrightFlags(args, options) {
    if (options.headed) {
        if (options.step.supportsHeaded === false) {
            throw new Error(`Step ${options.step.logName} does not support headed mode.`);
        }
        args.push('--headed');
    }
    if (options.debug) {
        if (options.step.supportsDebug === false) {
            throw new Error(`Step ${options.step.logName} does not support debug mode.`);
        }
        args.push('--debug');
    }
    if (options.workers !== undefined) {
        args.push('--workers', String(options.workers));
    }
    if (options.testList) {
        args.push('--test-list', options.testList);
    }
}
function buildPnpmExecPrefix(baseDir) {
    return baseDir === '.' ? ['exec'] : ['--dir', baseDir, 'exec'];
}
function resolveRunnerPaths(configPath, files) {
    const normalizedConfigPath = configPath.replace(/\\/gu, '/');
    const baseDir = path.posix.dirname(normalizedConfigPath);
    const configArg = path.posix.basename(normalizedConfigPath);
    if (baseDir === '.') {
        return {
            baseDir,
            configArg: normalizedConfigPath,
            files: [...files],
        };
    }
    return {
        baseDir,
        configArg,
        files: files.map((file) => {
            const normalizedFile = file.replace(/\\/gu, '/');
            if (path.posix.isAbsolute(normalizedFile) || normalizedFile.startsWith(`${baseDir}/`)) {
                return path.posix.relative(baseDir, normalizedFile);
            }
            return normalizedFile;
        }),
    };
}
//# sourceMappingURL=command-builder.js.map