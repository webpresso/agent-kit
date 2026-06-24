import { existsSync } from 'node:fs';
import path from 'node:path';
import { sharedOxlintConfigArgs } from '#config/oxlint/shared-config-path';
import { getBranchChangedFiles, getGitTopLevel, getStagedFiles, } from '#git/changed-files';
import { getManagedRunner } from '#tool-runtime';
import { emitCliCommandOutput, runCliCommandSequence } from './quality-runner.js';
export const LINT_COMMAND_HELP = [
    'Lint via the `vp lint` facade.',
    '',
    'Examples:',
    '  wp lint',
    '  wp lint --file src/index.ts',
    '  wp lint --affected              # staged JS/TS files only',
    '  wp lint --affected --branch     # changed vs origin/${GITHUB_BASE_REF:-main}',
    '  wp lint --fix',
    '',
    '`--affected` only sees staged files. Run git add first, or use `--affected --branch`.',
].join('\n');
const OXLINT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.cjs', '.mjs']);
export function registerLintCommand(cli, deps = {}) {
    cli
        .command('lint', LINT_COMMAND_HELP)
        .option('--file <path>', 'Lint a file or path target (repeatable)')
        .option('--affected', 'Lint git-changed targets only (staged files by default)')
        .option('--branch', 'With --affected, scope to files changed vs origin/${GITHUB_BASE_REF:-main}')
        .option('--fix', 'Apply autofixes via vp lint --fix')
        .option('--full', 'Print the full raw output instead of the default summary-first view')
        .action(async (flags) => {
        const files = toArray(flags.file);
        const affected = Boolean(flags.affected);
        const branch = Boolean(flags.branch);
        const fix = Boolean(flags.fix);
        const cwd = process.cwd();
        const resolveGitTopLevel = deps.getGitTopLevel ?? getGitTopLevel;
        const affectedCwd = affected ? (resolveGitTopLevel(cwd) ?? cwd) : cwd;
        if (branch && !affected) {
            console.error('--branch requires --affected');
            return 1;
        }
        if (affected && files.length > 0) {
            console.error('Cannot use --affected and --file together.');
            return 1;
        }
        let targetFiles = files.length > 0 ? files : undefined;
        if (affected) {
            const selection = branch
                ? (deps.getBranchChangedFiles ?? getBranchChangedFiles)(cwd)
                : (deps.getStagedFiles ?? getStagedFiles)(cwd);
            if (selection.degraded) {
                if (fix) {
                    console.error(`Unable to determine affected files for lint --fix (${selection.reason}); refusing a degraded whole-repo write. Rerun without --affected or pass --file explicitly.`);
                    return 1;
                }
                console.error(`Unable to determine affected files for lint (${selection.reason}); falling back to whole-repo lint.`);
                targetFiles = undefined;
            }
            else {
                const executionCwd = affectedCwd;
                const lintableFiles = filterLintableFiles(selection.files, executionCwd);
                if (lintableFiles.length === 0) {
                    console.log(branch
                        ? 'No affected lintable files changed vs base ref — skipping lint.'
                        : 'No staged affected lintable files — skipping lint.');
                    return 0;
                }
                targetFiles = lintableFiles;
            }
        }
        const command = buildLintCommand({
            files: targetFiles,
            fix,
            cwd: affectedCwd,
        });
        const result = await runCliCommandSequence({
            commandName: 'lint',
            commands: [command],
            cwd: affectedCwd,
            metadataOptions: {
                affected,
                branch: affected ? branch : undefined,
                fix,
                files: targetFiles,
            },
            summary: ({ exitCode, timedOut, aborted }) => {
                if (timedOut)
                    return 'lint timed out via vp lint';
                if (aborted)
                    return 'lint aborted via vp lint';
                return exitCode === 0
                    ? 'lint passed via vp lint'
                    : `lint failed via vp lint (exit ${exitCode})`;
            },
        });
        emitCliCommandOutput({
            entry: result.entry,
            summary: result.entry.summary ?? '',
            passed: result.exitCode === 0,
            full: Boolean(flags.full),
            toolName: 'lint-oxlint',
        });
        return result.exitCode;
    });
}
export function buildLintCommand(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const args = ['lint', '--format=json'];
    args.push(...sharedOxlintConfigArgs(cwd, args));
    if (options.fix)
        args.push('--fix');
    if (options.files && options.files.length > 0)
        args.push(...options.files);
    else
        args.push('.');
    const resolution = getManagedRunner('vp', { outputPolicy: 'structured' });
    return {
        command: resolution.command,
        args: [...resolution.args, ...args],
    };
}
function filterLintableFiles(files, cwd) {
    return files.filter((file) => {
        const extension = path.extname(file).toLowerCase();
        return OXLINT_EXTENSIONS.has(extension) && existsSync(path.join(cwd, file));
    });
}
function toArray(value) {
    if (value === undefined)
        return [];
    return typeof value === 'string' ? [value] : [...value];
}
//# sourceMappingURL=lint.js.map