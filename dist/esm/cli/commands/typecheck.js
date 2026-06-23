import { resolveProjectRoot } from '#mcp/tools/_shared/project-root.js';
import { getManagedRunner } from '#tool-runtime';
import { getPackageScript, isRecursiveWpScript } from '#cli/package-scripts.js';
import { emitCliCommandOutput, runCliCommandSequence, } from './quality-runner.js';
import { planTypecheckExecution } from '#typecheck/planner.js';
export const TYPECHECK_COMMAND_HELP = [
    'Typecheck the current workspace through the portable wp surface.',
    '',
    'Use --file to resolve source files to their owning scope and run the normal',
    'scope typecheck once per resolved scope. This is not isolated-file `tsc`.',
    '',
    'Examples:',
    '  wp typecheck',
    '  wp typecheck --file src/index.ts',
    '  wp typecheck --package @webpresso/agent-kit',
    '  wp typecheck --pretty',
].join('\n');
export function registerTypecheckCommand(cli) {
    cli
        .command('typecheck', TYPECHECK_COMMAND_HELP)
        .option('--file <path>', 'Resolve a source file to its owning typecheck scope (repeatable)')
        .option('--package <name>', 'Run the owning-scope typecheck for an exact package.json name (repeatable)')
        .option('--pretty', 'Keep TypeScript pretty output enabled')
        .option('--full', 'Print the full raw output instead of the default summary-first view')
        .action(async (flags) => {
        const files = toArray(flags.file);
        const packages = toArray(flags.package);
        const result = await runTypecheckCommand({
            pretty: Boolean(flags.pretty),
            files,
            packages,
        });
        emitCliCommandOutput({
            entry: result.entry,
            summary: result.entry.summary ?? '',
            passed: result.exitCode === 0,
            full: Boolean(flags.full),
            toolName: 'wp_typecheck',
        });
        return result.exitCode;
    });
}
export function buildTypecheckCommand(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const checkTypesScript = getPackageScript(cwd, 'check-types');
    if (checkTypesScript && !isRecursiveWpScript(checkTypesScript, 'typecheck')) {
        const resolution = getManagedRunner('vp');
        return {
            command: resolution.command,
            args: [...resolution.args, 'run', 'check-types'],
        };
    }
    const resolution = getManagedRunner('tsc');
    return {
        command: resolution.command,
        args: [...resolution.args, '--noEmit', ...(options.pretty ? [] : ['--pretty', 'false'])],
    };
}
export async function runTypecheckCommand(options = {}) {
    if (options.files &&
        options.files.length > 0 &&
        options.packages &&
        options.packages.length > 0) {
        throw new Error('Cannot use both --file and --package for typecheck targeting.');
    }
    const cwd = options.cwd ?? process.cwd();
    const targeted = (options.files?.length ?? 0) > 0 || (options.packages?.length ?? 0) > 0;
    const repoRoot = resolveProjectRoot({ cwd });
    const plan = targeted
        ? planTypecheckExecution({
            repoRoot,
            defaultScopeRoot: cwd,
            files: options.files,
            packages: options.packages,
            pretty: options.pretty,
        })
        : {
            commands: [buildTypecheckCommand(options)],
            preambleLine: undefined,
            resolvedScopes: [],
        };
    const commands = plan.commands.map((command) => ({
        command: command.command,
        args: command.args,
        env: command.env,
        cwd: 'cwd' in command ? command.cwd : cwd,
    }));
    const result = await runCliCommandSequence({
        commandName: 'typecheck',
        commands,
        cwd,
        preambleLines: plan.preambleLine ? [plan.preambleLine] : undefined,
        metadataOptions: {
            pretty: Boolean(options.pretty),
            files: options.files && options.files.length > 0 ? [...options.files] : undefined,
            packages: options.packages && options.packages.length > 0 ? [...options.packages] : undefined,
            resolvedScopes: plan.resolvedScopes.length > 0 ? plan.resolvedScopes.map((scope) => scope.name) : undefined,
        },
        summary: ({ exitCode, timedOut, aborted }) => {
            if (timedOut)
                return 'typecheck timed out';
            if (aborted)
                return 'typecheck aborted';
            return exitCode === 0 ? 'typecheck passed' : `typecheck failed (exit ${exitCode})`;
        },
    });
    return { exitCode: result.exitCode, entry: result.entry };
}
function toArray(value) {
    if (value === undefined)
        return [];
    return typeof value === 'string' ? [value] : [...value];
}
//# sourceMappingURL=typecheck.js.map