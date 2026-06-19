import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { isProjectOwnedTool, isUserOwnedTool, readToolingOwnershipState, tryReadRepoKey, } from '#cli/tooling-ownership';
import { appendGlobalCapableVpArgs, resolveGlobalCapableVpCommand, } from '#cli/global-vp.js';
import { resolveAgentKitPackageRoot } from '#cli/commands/init/package-root';
import { ensureClaudeCodeUserPlugin } from '#cli/commands/init/scaffolders/claude-plugin/index.js';
import { ensureCodexUserPlugin } from '#cli/commands/init/scaffolders/codex-plugin/index.js';
import { getManagedRunner } from '#tool-runtime';
export const PACKAGE_MANAGER_VERBS = ['install', 'add', 'remove', 'update', 'exec', 'run'];
const HELP_BY_VERB = {
    install: 'Install dependencies through the managed vp facade.',
    add: 'Add dependencies through the managed vp facade.',
    remove: 'Remove dependencies through the managed vp facade.',
    update: 'Refresh wp and any optional OMX/OMC/gstack integrations previously installed by wp; use --deps for local dependency updates through the managed vp facade.',
    exec: 'Run a binary through the managed vp facade.',
    run: 'Run a package script through the managed vp facade.',
};
const GSTACK_REPO = 'https://github.com/garrytan/gstack.git';
export function registerPackageManagerCommand(cli, verb) {
    const command = cli.command(`${verb} [...args]`, HELP_BY_VERB[verb]);
    if (verb === 'update') {
        command.option('--deps', 'Update local dependencies through managed vp update.');
        command.option('-g, --global', 'Compatibility alias for the default tooling refresh.');
    }
    command.allowUnknownOptions().action(() => runPackageManagerCommand(verb));
}
export function buildPackageManagerCommand(verb, argv = process.argv) {
    const resolution = getManagedRunner('vp');
    const verbArgs = extractVerbArgs(verb, argv);
    return {
        command: resolution.command,
        args: [
            ...resolution.args,
            verb,
            ...(verb === 'update' ? stripWpUpdateControlFlags(verbArgs) : verbArgs),
        ],
    };
}
export function runPackageManagerCommand(verb, deps = {}) {
    const argv = deps.argv ?? process.argv;
    const cwd = deps.cwd ?? process.cwd();
    if (verb === 'update') {
        const mode = parseUpdateMode(extractVerbArgs(verb, argv));
        if (mode.kind === 'error')
            return failUsage(mode.message);
        if (mode.kind === 'tooling')
            return runGlobalUpdateCommand(deps);
        const packageRoot = resolveNearestPackageRoot(cwd, deps.exists ?? existsSync);
        if (packageRoot === null) {
            return failUsage(`wp update --deps: no package root found from ${cwd}; run inside a package or omit --deps to refresh tooling.`);
        }
        const command = buildPackageManagerCommand(verb, argv);
        const result = (deps.run ?? defaultRun)(command.command, command.args, {
            cwd: packageRoot,
        });
        return typeof result.status === 'number' ? result.status : 1;
    }
    const packageRoot = resolveNearestPackageRoot(cwd, deps.exists ?? existsSync);
    const command = buildPackageManagerCommand(verb, argv);
    const result = (deps.run ?? defaultRun)(command.command, command.args, {
        cwd: packageRoot ?? cwd,
    });
    return typeof result.status === 'number' ? result.status : 1;
}
function runGlobalUpdateCommand(deps) {
    const cwd = deps.cwd ?? process.cwd();
    const vpCommand = deps.resolveVpCommand !== undefined ? deps.resolveVpCommand() : resolveGlobalCapableVpCommand();
    if (vpCommand === null) {
        return failUsage('wp update: no global-capable vp executable found on PATH; ensure the user-global Vite+ vp is installed and appears before project/runtime-local shims.');
    }
    const globalDeps = {
        exists: deps.exists ?? existsSync,
        gstackRoot: deps.gstackRoot ?? defaultGstackRoot(),
        mkdir: deps.mkdir ?? mkdirSync,
        ownershipState: deps.ownershipState ?? readToolingOwnershipState(),
        packageRoot: deps.packageRoot === undefined
            ? resolveAgentKitPackageRoot({ moduleUrl: import.meta.url })
            : deps.packageRoot,
        repoKey: deps.repoKey ?? tryReadRepoKey(cwd),
        refreshClaudePlugin: deps.refreshClaudePlugin ?? refreshClaudeUserPlugin,
        refreshCodexPlugin: deps.refreshCodexPlugin ?? refreshCodexUserPlugin,
        vpCommand,
        run: deps.run ?? defaultRun,
    };
    const steps = buildGlobalUpdateSteps(globalDeps);
    let failed = false;
    for (const step of steps) {
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
function buildGlobalUpdateSteps(deps) {
    const steps = [];
    if (isUserOwnedTool(deps.ownershipState, 'omx') ||
        isProjectOwnedTool(deps.ownershipState, 'omx', deps.repoKey)) {
        const command = appendGlobalCapableVpArgs(deps.vpCommand, ['update', '-g', 'oh-my-codex']);
        steps.push({
            id: 'omx',
            command: command[0],
            args: command.slice(1),
        });
    }
    if (isUserOwnedTool(deps.ownershipState, 'omc')) {
        steps.push({
            id: 'omc',
            command: 'claude',
            args: ['plugin', 'update', '--scope', 'user', 'oh-my-claudecode'],
        });
    }
    if (isProjectOwnedTool(deps.ownershipState, 'omc', deps.repoKey)) {
        steps.push({
            id: 'omc-project',
            command: 'claude',
            args: ['plugin', 'update', '--scope', 'project', 'oh-my-claudecode'],
        });
    }
    if (isUserOwnedTool(deps.ownershipState, 'gstack')) {
        steps.push({
            id: 'gstack',
            run: refreshGstack,
        });
    }
    const command = appendGlobalCapableVpArgs(deps.vpCommand, [
        'install',
        '-g',
        '@webpresso/agent-kit',
    ]);
    steps.push({
        id: 'wp',
        command: command[0],
        args: command.slice(1),
    });
    steps.push({
        id: 'claude-plugin',
        run: refreshClaudePlugin,
    });
    steps.push({
        id: 'codex-plugin',
        run: refreshCodexPlugin,
    });
    return steps;
}
function runGlobalUpdateStep(step, deps) {
    if ('command' in step)
        return deps.run(step.command, step.args);
    return step.run(deps);
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
function refreshCodexPlugin(deps) {
    if (!deps.packageRoot) {
        return spawnLike(1, new Error('could not resolve @webpresso/agent-kit package root'));
    }
    return deps.refreshCodexPlugin(deps.packageRoot);
}
function refreshClaudePlugin(deps) {
    if (!deps.packageRoot) {
        return spawnLike(1, new Error('could not resolve @webpresso/agent-kit package root'));
    }
    return deps.refreshClaudePlugin(deps.packageRoot);
}
function refreshClaudeUserPlugin(packageRoot) {
    const result = ensureClaudeCodeUserPlugin({
        options: { dryRun: false, overwrite: false },
        packageRoot,
    });
    switch (result.kind) {
        case 'claude-plugin-installed':
        case 'claude-plugin-skipped-no-cli':
        case 'claude-plugin-skipped-opt-out':
        case 'claude-plugin-skipped-package-lifecycle':
            return spawnLike(0);
        case 'claude-plugin-skipped-dry-run':
        case 'claude-plugin-unavailable':
        case 'claude-plugin-failed':
            return spawnLike(1, new Error(result.kind));
    }
}
function refreshCodexUserPlugin(packageRoot) {
    const result = ensureCodexUserPlugin({
        options: { dryRun: false, overwrite: false },
        packageRoot,
    });
    switch (result.kind) {
        case 'codex-plugin-installed':
        case 'codex-plugin-skipped-no-cli':
        case 'codex-plugin-skipped-opt-out':
        case 'codex-plugin-skipped-package-lifecycle':
            return spawnLike(0);
        case 'codex-plugin-skipped-dry-run':
        case 'codex-plugin-unavailable':
        case 'codex-plugin-timed-out':
        case 'codex-plugin-failed':
            return spawnLike(1, new Error(result.kind));
    }
}
function spawnLike(status, error) {
    return {
        error,
        output: [],
        pid: 0,
        signal: null,
        status,
        stderr: '',
        stdout: '',
    };
}
function defaultGstackRoot() {
    return path.join(process.env.HOME || homedir(), '.claude', 'skills', 'gstack');
}
function resolveNearestPackageRoot(startCwd, exists) {
    let current = path.resolve(startCwd);
    while (true) {
        if (exists(path.join(current, 'package.json')))
            return current;
        const parent = path.dirname(current);
        if (parent === current)
            return null;
        current = parent;
    }
}
function extractVerbArgs(verb, argv) {
    const verbIndex = argv.findIndex((arg, index) => index >= 2 && arg === verb);
    return verbIndex === -1 ? [] : argv.slice(verbIndex + 1);
}
function parseUpdateMode(args) {
    const hasDeps = args.includes('--deps');
    const hasGlobal = hasGlobalFlag(args);
    const hasPositional = hasDependencyPositional(args);
    if (hasDeps && hasGlobal) {
        return {
            kind: 'error',
            message: 'wp update: --deps cannot be combined with --global; choose dependency updates or tooling refresh.',
        };
    }
    if (hasGlobal && hasPositional) {
        return {
            kind: 'error',
            message: 'wp update: package arguments imply --deps and cannot be combined with --global; use `wp update --deps ...` for dependency updates.',
        };
    }
    if (hasDeps || hasPositional)
        return { kind: 'deps' };
    const unknownFlags = args.filter((arg) => !isGlobalFlag(arg));
    if (unknownFlags.length > 0) {
        return {
            kind: 'error',
            message: `wp update: unrecognized tooling option(s): ${unknownFlags.join(', ')}. Bare \`wp update\` refreshes tooling; use \`wp update --deps ${unknownFlags.join(' ')}\` to pass dependency-update options.`,
        };
    }
    return { kind: 'tooling' };
}
function stripWpUpdateControlFlags(args) {
    return args.filter((arg) => arg !== '--deps' && !isGlobalFlag(arg));
}
function hasDependencyPositional(args) {
    let afterTerminator = false;
    for (const arg of args) {
        if (afterTerminator)
            return true;
        if (arg === '--') {
            afterTerminator = true;
            continue;
        }
        if (!arg.startsWith('-'))
            return true;
    }
    return false;
}
function hasGlobalFlag(args) {
    return args.some(isGlobalFlag);
}
function isGlobalFlag(arg) {
    return arg === '--global' || arg === '-g';
}
function failUsage(message) {
    console.error(message);
    return 1;
}
function formatGlobalUpdateFailure(step, result) {
    const error = result.error;
    if (error)
        return `wp update: ${step.id} failed: ${error.message}`;
    if (typeof result.status === 'number') {
        return `wp update: ${step.id} failed: exit ${result.status}`;
    }
    if (result.signal)
        return `wp update: ${step.id} failed: signal ${result.signal}`;
    return `wp update: ${step.id} failed: no exit status`;
}
function formatGlobalUpdateThrownFailure(step, error) {
    const message = error instanceof Error ? error.message : String(error);
    return `wp update: ${step.id} failed: ${message}`;
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