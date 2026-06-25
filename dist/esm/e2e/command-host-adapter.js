export function createCommandE2eHostAdapter(options) {
    return {
        listSuites() {
            return options.listSuites().map(cloneE2eSuiteDefinition);
        },
        resolveSuiteId: options.resolveSuiteId,
        resolveSuiteGroup: options.resolveSuiteGroup,
        normalizeFilePath: options.normalizeFilePath,
        resolveSuiteForFile: options.resolveSuiteForFile,
        buildExecutionPlan(request) {
            return [
                toPlannedRunGroup(options.buildCommandGroup(request), request, options.defaultSuiteId),
            ];
        },
    };
}
export function cloneE2eStepDefinition(step) {
    return {
        runner: step.runner,
        logName: step.logName,
        configPath: step.configPath,
        fixedFiles: step.fixedFiles ? [...step.fixedFiles] : undefined,
        fixedArgs: step.fixedArgs ? [...step.fixedArgs] : undefined,
        commandArgs: step.commandArgs ? [...step.commandArgs] : undefined,
        supportsHeaded: step.supportsHeaded,
        supportsDebug: step.supportsDebug,
        batchKey: step.batchKey,
        envProfile: step.envProfile,
        runtimeProfile: step.runtimeProfile,
        reportDir: step.reportDir,
        env: cloneEnv(step.env),
    };
}
export function cloneE2eSuiteDefinition(suite) {
    return {
        id: suite.id,
        aliases: suite.aliases ? [...suite.aliases] : undefined,
        fileMatchers: [...suite.fileMatchers],
        batchKey: suite.batchKey,
        envProfile: suite.envProfile,
        runtimeProfile: suite.runtimeProfile,
        steps: suite.steps.map(cloneE2eStepDefinition),
        env: cloneEnv(suite.env),
    };
}
function toPlannedRunGroup(group, request, defaultSuiteId) {
    return {
        batchKey: group.batchKey,
        envProfile: group.envProfile,
        runtimeProfile: group.runtimeProfile ?? group.envProfile,
        env: cloneEnv(group.env),
        runs: [
            {
                suiteId: group.run.suiteId ?? request.suite ?? defaultSuiteId,
                batchKey: group.run.batchKey,
                envProfile: group.run.envProfile,
                runtimeProfile: group.run.runtimeProfile ??
                    group.run.envProfile ??
                    group.runtimeProfile ??
                    group.envProfile,
                env: cloneEnv(group.run.env),
                runner: "command",
                logName: group.run.logName,
                reportDir: group.run.reportDir,
                command: group.run.command,
                args: [...group.run.args],
            },
        ],
    };
}
function cloneEnv(env) {
    if (!env || Object.keys(env).length === 0) {
        return undefined;
    }
    return { ...env };
}
//# sourceMappingURL=command-host-adapter.js.map