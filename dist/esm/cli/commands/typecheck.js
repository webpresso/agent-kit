import { getManagedRunner } from '#tool-runtime';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
export const TYPECHECK_COMMAND_HELP = [
    'Typecheck the current workspace through the portable wp surface.',
    '',
    'Examples:',
    '  wp typecheck',
    '  wp typecheck --pretty',
].join('\n');
export function registerTypecheckCommand(cli) {
    cli
        .command('typecheck', TYPECHECK_COMMAND_HELP)
        .option('--pretty', 'Keep TypeScript pretty output enabled')
        .action((flags) => runTypecheckCommand({ pretty: Boolean(flags.pretty) }));
}
export function buildTypecheckCommand(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    if (hasCheckTypesScript(cwd)) {
        const resolution = getManagedRunner('vp');
        return {
            command: resolution.command,
            args: [...resolution.args, 'run', 'check-types'],
        };
    }
    const resolution = getManagedRunner('tsc', {
        fallbackCommand: 'tsc',
        fallbackArgs: [],
    });
    return {
        command: resolution.command,
        args: [...resolution.args, '--noEmit', ...(options.pretty ? [] : ['--pretty', 'false'])],
    };
}
export function runTypecheckCommand(options = {}, deps = {}) {
    const command = buildTypecheckCommand(options);
    const result = (deps.run ?? defaultRun)(command.command, command.args);
    if (typeof result.status === 'number')
        return result.status;
    return 1;
}
function defaultRun(command, args) {
    return spawnSync(command, [...args], {
        encoding: 'utf8',
        env: process.env,
        stdio: 'inherit',
        windowsHide: true,
    });
}
function hasCheckTypesScript(cwd) {
    const packageJsonPath = join(cwd, 'package.json');
    if (!existsSync(packageJsonPath))
        return false;
    try {
        const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        return typeof parsed.scripts?.['check-types'] === 'string';
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=typecheck.js.map