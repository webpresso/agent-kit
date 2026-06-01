import { spawnSync } from 'node:child_process';
import { genericTransform } from '#output-transforms/generic';
export const ERR_COMMAND_HELP = [
    'Run a command and print only failure-looking output lines.',
    '',
    'Examples:',
    '  wp err sh -c \'echo a; echo "ERROR: x"; echo b\'',
    '  wp err pnpm test',
].join('\n');
export function registerErrCommand(cli) {
    cli
        .command('err [...cmd]', ERR_COMMAND_HELP)
        .allowUnknownOptions()
        .action((cmd) => {
        return runErrCommand(getRawErrCommandParts() ?? toArray(cmd));
    });
}
export function runErrCommand(commandParts, deps = {}) {
    if (commandParts.length === 0) {
        write(deps.stderr ?? process.stderr, 'Usage: wp err <cmd> [...args]\n');
        return 1;
    }
    const command = commandParts[0];
    const args = commandParts.slice(1);
    if (!command) {
        write(deps.stderr ?? process.stderr, 'Usage: wp err <cmd> [...args]\n');
        return 1;
    }
    const result = (deps.run ?? defaultRun)(command, args);
    const rawOutput = combineOutput(result.stdout, result.stderr);
    const compact = genericTransform(rawOutput || result.error?.message, {
        toolName: 'wp_err',
        normalizedToolName: 'err',
        persistOverflow: false,
    });
    if (compact.rawOutput) {
        write(deps.stdout ?? process.stdout, ensureTrailingNewline(compact.rawOutput));
    }
    return typeof result.status === 'number' ? result.status : result.error ? 1 : 0;
}
function defaultRun(command, args) {
    return spawnSync(command, [...args], {
        encoding: 'utf8',
        env: process.env,
        windowsHide: true,
    });
}
function combineOutput(stdout, stderr) {
    const parts = [stdout ?? '', stderr ?? ''].filter((part) => part.length > 0);
    if (parts.length === 0)
        return '';
    if (parts.length === 1)
        return parts[0] ?? '';
    return parts[0]?.endsWith('\n') ? parts.join('') : parts.join('\n');
}
function ensureTrailingNewline(output) {
    return output.endsWith('\n') ? output : `${output}\n`;
}
function toArray(value) {
    if (value === undefined)
        return [];
    return typeof value === 'string' ? [value] : [...value];
}
function getRawErrCommandParts() {
    const errIndex = process.argv.indexOf('err');
    if (errIndex < 0)
        return undefined;
    return process.argv.slice(errIndex + 1);
}
function write(stream, message) {
    stream.write(message);
}
//# sourceMappingURL=err.js.map