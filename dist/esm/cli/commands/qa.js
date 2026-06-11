import { spawnSync } from 'node:child_process';
import { getPackageScript, isRecursiveWpScript } from '#cli/package-scripts.js';
import { getManagedRunner } from '#tool-runtime';
export const QA_COMMAND_HELP = [
    'Run the repository QA gate through the portable wp surface.',
    '',
    'Examples:',
    '  wp qa',
    '  wp qa --print-command',
].join('\n');
const RECURSIVE_QA_MESSAGE = 'Refusing to run a recursive qa script. Point package.json scripts.qa at the real QA pipeline, not `wp qa`.\n';
export function registerQaCommand(cli) {
    cli
        .command('qa', QA_COMMAND_HELP)
        .option('--print-command', 'Print the resolved command instead of executing it')
        .action((flags) => {
        const command = buildQaCommand({ cwd: process.cwd() });
        if (!command) {
            writeStderr(process.stderr, RECURSIVE_QA_MESSAGE);
            return 1;
        }
        if (flags.printCommand) {
            console.log(formatShellCommand(command));
            return 0;
        }
        return runQaCommand({ cwd: process.cwd() });
    });
}
export function buildQaCommand(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const qaScript = getPackageScript(cwd, 'qa');
    if (qaScript && isRecursiveWpScript(qaScript, 'qa'))
        return;
    const resolution = getManagedRunner('vp');
    return {
        command: resolution.command,
        args: [...resolution.args, 'run', 'qa'],
    };
}
export function runQaCommand(options = {}, deps = {}) {
    const command = buildQaCommand(options);
    if (!command) {
        writeStderr(deps.stderr ?? process.stderr, RECURSIVE_QA_MESSAGE);
        return 1;
    }
    const result = (deps.run ?? defaultRun)(command.command, command.args);
    return typeof result.status === 'number' ? result.status : 1;
}
function defaultRun(command, args) {
    return spawnSync(command, [...args], {
        encoding: 'utf8',
        env: process.env,
        stdio: 'inherit',
        windowsHide: true,
    });
}
function formatShellCommand(config) {
    return [config.command, ...config.args].map(shellQuote).join(' ');
}
function shellQuote(value) {
    return /^[A-Za-z0-9_./:=@+-]+$/u.test(value) ? value : `'${value.replace(/'/gu, "'\\''")}'`;
}
function writeStderr(stream, message) {
    stream.write(message);
}
//# sourceMappingURL=qa.js.map