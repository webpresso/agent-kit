import type {
  E2eExecutionRequest,
  E2eHostAdapter,
  E2eStepDefinition,
  E2eSuiteDefinition,
  PlannedE2eRunGroup,
  ResolvedE2eFile,
} from "./types.js";

export interface CommandHostAdapterRunDefinition {
  batchKey: string;
  logName: string;
  command: string;
  args: string[];
  suiteId?: string;
  envProfile?: string;
  runtimeProfile?: string;
  env?: Record<string, string>;
  reportDir?: string;
}

export interface CommandHostAdapterGroupDefinition {
  batchKey: string;
  envProfile?: string;
  runtimeProfile?: string;
  env?: Record<string, string>;
  run: CommandHostAdapterRunDefinition;
}

export interface CreateCommandE2eHostAdapterOptions {
  listSuites: () => readonly E2eSuiteDefinition[];
  resolveSuiteId: (name: string) => string | null;
  resolveSuiteGroup?: (name: string) => readonly string[] | null;
  normalizeFilePath: (filePath: string) => string;
  resolveSuiteForFile: (filePath: string) => ResolvedE2eFile | null;
  defaultSuiteId: string;
  buildCommandGroup: (request: E2eExecutionRequest) => CommandHostAdapterGroupDefinition;
}

export function createCommandE2eHostAdapter(
  options: CreateCommandE2eHostAdapterOptions,
): E2eHostAdapter {
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

export function cloneE2eStepDefinition(step: E2eStepDefinition): E2eStepDefinition {
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

export function cloneE2eSuiteDefinition(suite: E2eSuiteDefinition): E2eSuiteDefinition {
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

function toPlannedRunGroup(
  group: CommandHostAdapterGroupDefinition,
  request: E2eExecutionRequest,
  defaultSuiteId: string,
): PlannedE2eRunGroup {
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
        runtimeProfile:
          group.run.runtimeProfile ??
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

function cloneEnv(env?: Record<string, string>): Record<string, string> | undefined {
  if (!env || Object.keys(env).length === 0) {
    return undefined;
  }

  return { ...env };
}
