import { spawn } from 'node:child_process';
import { loadConfiguredHostAdapter } from './load-host-adapter.js';
import { planE2eRun, planGenericE2eRun } from './run-planner.js';
export async function createE2eExecutionPlan(input, cwd = process.cwd()) {
    // Explicit runner/config requests are generic-by-intent. Bypass host adapters
    // so MCP callers can force a specific runner without inheriting suite defaults
    // (e.g. host Playwright config when runner=vitest).
    if (input.runner || input.config) {
        return planGenericE2eRun({
            suite: input.suite,
            runner: input.runner,
            config: input.config,
            files: toArray(input.files),
            headed: input.headed,
            debug: input.debug,
            reuseReset: input.reuseReset,
            noSupervisor: input.noSupervisor,
            workers: input.workers,
            testList: input.testList,
            passthrough: input.passthrough,
            filterOutput: input.filterOutput,
        });
    }
    const hostAdapter = await loadConfiguredHostAdapter(cwd);
    const files = toArray(input.files);
    if (!hostAdapter?.adapter) {
        return planGenericE2eRun({
            suite: input.suite,
            runner: input.runner,
            config: input.config,
            files,
            headed: input.headed,
            debug: input.debug,
            reuseReset: input.reuseReset,
            noSupervisor: input.noSupervisor,
            workers: input.workers,
            testList: input.testList,
            passthrough: input.passthrough,
            filterOutput: input.filterOutput,
        });
    }
    if (hostAdapter.adapter.buildExecutionPlan) {
        return hostAdapter.adapter.buildExecutionPlan({
            suite: input.suite,
            file: files,
            files,
            headed: input.headed,
            debug: input.debug,
            reuseReset: input.reuseReset,
            noSupervisor: input.noSupervisor,
            workers: input.workers,
            testList: input.testList,
            passthrough: input.passthrough,
            filterOutput: input.filterOutput,
        });
    }
    return planE2eRun({
        hostAdapter: hostAdapter.adapter,
        suite: input.suite,
        file: files,
        headed: input.headed,
        debug: input.debug,
        workers: input.workers,
        testList: input.testList,
        passthrough: input.passthrough,
        filterOutput: input.filterOutput,
    });
}
export function plannedGroupsToCommandConfigs(groups) {
    return groups.flatMap((group) => group.runs.map((run) => ({
        command: run.command,
        args: run.args,
        env: normalizeEnv({ ...group.env, ...run.env }),
    })));
}
export function formatShellCommand(config) {
    return [config.command, ...config.args].map(shellQuote).join(' ');
}
export async function runCommandConfigs(commands, options = {}) {
    let combinedOutput = '';
    for (const command of commands) {
        const result = await runCommand(command, options);
        combinedOutput += result.output;
        if (result.exitCode !== 0) {
            return {
                passed: false,
                exitCode: result.exitCode,
                output: combinedOutput,
            };
        }
    }
    return {
        passed: true,
        exitCode: 0,
        output: combinedOutput,
    };
}
async function runCommand(command, options) {
    return new Promise((resolve) => {
        const child = spawn(command.command, command.args, {
            env: { ...process.env, ...command.env },
            signal: options.signal,
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString('utf8');
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString('utf8');
        });
        child.on('error', (error) => {
            const message = error.message || String(error);
            resolve({
                exitCode: 1,
                output: [stdout, stderr, message].filter(Boolean).join(''),
            });
        });
        child.on('close', (code, signal) => {
            const exitCode = code ?? exitCodeFromSignal(signal);
            resolve({
                exitCode,
                output: [stdout, stderr].filter(Boolean).join(''),
            });
        });
    });
}
function exitCodeFromSignal(signal) {
    if (!signal)
        return 1;
    const codeBySignal = {
        SIGINT: 2,
        SIGKILL: 9,
        SIGTERM: 15,
    };
    return 128 + (codeBySignal[signal] ?? 15);
}
function shellQuote(value) {
    return /^[A-Za-z0-9_./:=@+-]+$/u.test(value) ? value : `'${value.replace(/'/gu, "'\\''")}'`;
}
function toArray(value) {
    if (value === undefined)
        return [];
    return typeof value === 'string' ? [value] : [...value];
}
function normalizeEnv(env) {
    if (!env || Object.keys(env).length === 0) {
        return undefined;
    }
    return env;
}
//# sourceMappingURL=execution.js.map