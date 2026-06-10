import { spawnSync } from 'node:child_process';
import { getManagedRunner } from '#tool-runtime';
export const PACKAGE_MANAGER_VERBS = ['install', 'add', 'remove', 'update', 'exec', 'run'];
const HELP_BY_VERB = {
    install: 'Install dependencies through the managed vp facade.',
    add: 'Add dependencies through the managed vp facade.',
    remove: 'Remove dependencies through the managed vp facade.',
    update: 'Update dependencies through the managed vp facade.',
    exec: 'Run a binary through the managed vp facade.',
    run: 'Run a package script through the managed vp facade.',
};
export function registerPackageManagerCommand(cli, verb) {
    cli
        .command(`${verb} [...args]`, HELP_BY_VERB[verb])
        .allowUnknownOptions()
        .action(() => runPackageManagerCommand(verb));
}
export function buildPackageManagerCommand(verb, argv = process.argv) {
    const resolution = getManagedRunner('vp');
    return {
        command: resolution.command,
        args: [...resolution.args, verb, ...extractVerbArgs(verb, argv)],
    };
}
export function runPackageManagerCommand(verb, deps = {}) {
    const command = buildPackageManagerCommand(verb);
    const result = (deps.run ?? defaultRun)(command.command, command.args);
    return typeof result.status === 'number' ? result.status : 1;
}
function extractVerbArgs(verb, argv) {
    const verbIndex = argv.findIndex((arg, index) => index >= 2 && arg === verb);
    return verbIndex === -1 ? [] : argv.slice(verbIndex + 1);
}
function defaultRun(command, args) {
    return spawnSync(command, [...args], {
        encoding: 'utf8',
        env: process.env,
        stdio: 'inherit',
        windowsHide: true,
    });
}
//# sourceMappingURL=package-manager.js.map