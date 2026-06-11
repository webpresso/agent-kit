import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { getManagedRunner } from '#tool-runtime';
export const PACKAGE_MANAGER_VERBS = ['install', 'add', 'remove', 'update', 'exec', 'run'];
const HELP_BY_VERB = {
    install: 'Install dependencies through the managed vp facade.',
    add: 'Add dependencies through the managed vp facade.',
    remove: 'Remove dependencies through the managed vp facade.',
    update: 'Update local dependencies through the managed vp facade (default); use --global to refresh codex, tmux, omx, omc, gstack, and wp.',
    exec: 'Run a binary through the managed vp facade.',
    run: 'Run a package script through the managed vp facade.',
};
const GSTACK_REPO = 'https://github.com/garrytan/gstack.git';
const GLOBAL_UPDATE_STEPS = [
    {
        id: 'codex',
        command: 'vp',
        args: ['update', '-g', '--latest', '@openai/codex'],
    },
    {
        id: 'tmux',
        run: ensureTmux,
    },
    {
        id: 'omx',
        command: 'vp',
        args: ['update', '-g', 'oh-my-codex'],
    },
    {
        id: 'omc',
        command: 'claude',
        args: ['plugin', 'update', '-s', 'user', 'oh-my-claudecode'],
    },
    {
        id: 'gstack',
        run: refreshGstack,
    },
    {
        id: 'wp',
        command: 'vp',
        args: ['install', '-g', '@webpresso/agent-kit'],
    },
];
export function registerPackageManagerCommand(cli, verb) {
    const command = cli.command(`${verb} [...args]`, HELP_BY_VERB[verb]);
    if (verb === 'update') {
        command.option('-g, --global', 'Refresh codex, tmux, omx, omc, gstack, and wp instead of local dependencies.');
    }
    command.allowUnknownOptions().action(() => runPackageManagerCommand(verb));
}
export function buildPackageManagerCommand(verb, argv = process.argv) {
    const resolution = getManagedRunner('vp');
    return {
        command: resolution.command,
        args: [...resolution.args, verb, ...extractVerbArgs(verb, argv)],
    };
}
export function runPackageManagerCommand(verb, deps = {}) {
    const argv = deps.argv ?? process.argv;
    if (verb === 'update' && hasGlobalFlag(extractVerbArgs(verb, argv))) {
        return runGlobalUpdateCommand(deps);
    }
    const command = buildPackageManagerCommand(verb, argv);
    const result = (deps.run ?? defaultRun)(command.command, command.args);
    return typeof result.status === 'number' ? result.status : 1;
}
function runGlobalUpdateCommand(deps) {
    const globalDeps = {
        exists: deps.exists ?? existsSync,
        gstackRoot: deps.gstackRoot ?? defaultGstackRoot(),
        mkdir: deps.mkdir ?? mkdirSync,
        run: deps.run ?? defaultRun,
    };
    let failed = false;
    for (const step of GLOBAL_UPDATE_STEPS) {
        try {
            const result = runGlobalUpdateStep(step, globalDeps);
            if (result.status !== 0) {
                failed = true;
                console.error(formatGlobalUpdateFailure(step, result));
            }
        }
        catch (error) {
            failed = true;
            console.error(formatGlobalUpdateThrownFailure(step, error));
        }
    }
    return failed ? 1 : 0;
}
function runGlobalUpdateStep(step, deps) {
    if ('command' in step)
        return deps.run(step.command, step.args);
    return step.run(deps);
}
function ensureTmux(deps) {
    const probe = deps.run('tmux', ['-V']);
    if (probe.status === 0)
        return probe;
    return deps.run('brew', ['install', 'tmux']);
}
function refreshGstack(deps) {
    const hasCheckout = deps.exists(path.join(deps.gstackRoot, '.git'));
    if (hasCheckout) {
        const pull = deps.run('git', ['-C', deps.gstackRoot, 'pull', '--ff-only', 'origin', 'main']);
        if (pull.status !== 0)
            return pull;
    }
    else {
        deps.mkdir(path.dirname(deps.gstackRoot), { recursive: true });
        const clone = deps.run('git', ['clone', '--depth', '1', GSTACK_REPO, deps.gstackRoot]);
        if (clone.status !== 0)
            return clone;
    }
    return deps.run('./setup', ['--team'], { cwd: deps.gstackRoot });
}
function defaultGstackRoot() {
    return path.join(process.env.HOME || homedir(), '.claude', 'skills', 'gstack');
}
function extractVerbArgs(verb, argv) {
    const verbIndex = argv.findIndex((arg, index) => index >= 2 && arg === verb);
    return verbIndex === -1 ? [] : argv.slice(verbIndex + 1);
}
function hasGlobalFlag(args) {
    return args.includes('--global') || args.includes('-g');
}
function formatGlobalUpdateFailure(step, result) {
    const error = result.error;
    if (error)
        return `wp update --global: ${step.id} failed: ${error.message}`;
    if (typeof result.status === 'number') {
        return `wp update --global: ${step.id} failed: exit ${result.status}`;
    }
    if (result.signal)
        return `wp update --global: ${step.id} failed: signal ${result.signal}`;
    return `wp update --global: ${step.id} failed: no exit status`;
}
function formatGlobalUpdateThrownFailure(step, error) {
    const message = error instanceof Error ? error.message : String(error);
    return `wp update --global: ${step.id} failed: ${message}`;
}
function defaultRun(command, args, options = {}) {
    return spawnSync(command, [...args], {
        cwd: options.cwd,
        encoding: 'utf8',
        env: process.env,
        stdio: 'inherit',
        windowsHide: true,
    });
}
//# sourceMappingURL=package-manager.js.map