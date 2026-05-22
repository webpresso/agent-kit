import { runLint } from '#lint/index';
export const LINT_COMMAND_HELP = [
    'Lint via `oxlint` (fast, structured output) with `vp run lint` as a fallback.',
    '',
    'Examples:',
    '  ak lint',
    '  ak lint --fix',
    '  ak lint --no-pnpm-fallback',
].join('\n');
export function registerLintCommand(cli) {
    cli
        .command('lint [...files]', LINT_COMMAND_HELP)
        .option('--fix', 'Apply autofixes via oxlint --fix')
        .option('--no-pnpm-fallback', 'Fail if oxlint missing instead of falling back to vp run lint')
        .action(async (files, flags) => {
        const result = await runLint({
            files: files && files.length > 0 ? files : undefined,
            fix: Boolean(flags.fix),
            cwd: process.cwd(),
        });
        if (flags.pnpmFallback === false && result.backend === 'vp') {
            console.error('oxlint not found on PATH and --no-pnpm-fallback was set. Install oxlint:');
            console.error('  vp install -D oxlint');
            return 1;
        }
        if (result.spawnError) {
            console.error(result.spawnError);
            return result.exitCode || 1;
        }
        if (result.parseError) {
            console.error(`lint output parse error: ${result.parseError}`);
        }
        if (result.issues.length > 0) {
            for (const issue of result.issues) {
                console.error(`${issue.file}:${issue.line}  [${issue.rule}]  ${issue.message}`);
            }
        }
        if (result.output) {
            process.stderr.write(result.output);
        }
        const verb = result.passed ? 'passed' : 'failed';
        const detail = result.issues.length > 0 ? ` (${result.issues.length} issue(s))` : '';
        console.error(`lint ${verb} via ${result.backend}${detail}`);
        return result.exitCode;
    });
}
//# sourceMappingURL=lint.js.map