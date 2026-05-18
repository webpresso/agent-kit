/**
 * `ak docs lint <path>` — run the blueprint-plan validator over a markdown
 * file or directory.
 *
 * Thin CLI shell: parse args → call runDocsLint → print results → exit.
 */
import { runDocsLint } from './docs-core.js';
function handleDocsError(error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
}
export function registerDocsCommand(cli) {
    cli
        .command('docs <action> [target]', 'Documentation tooling (lint)')
        .action(async (action, target) => {
        try {
            if (action !== 'lint') {
                throw new Error(`Unknown docs action: ${action}. Use 'lint'.`);
            }
            if (!target) {
                throw new Error('Usage: ak docs lint <path>');
            }
            const result = await runDocsLint(target);
            if (result.files === 0) {
                console.log(`No markdown files found at ${target}.`);
                process.exit(0);
            }
            if (result.violations.length === 0) {
                console.log(`✓ ${result.files} blueprint document(s) passed.`);
                process.exit(0);
            }
            for (const v of result.violations) {
                const ruleId = v.rule ? ` [${v.rule}]` : '';
                console.log(`${v.file} ERROR${ruleId} ${v.message}`);
            }
            const errorCount = result.violations.length;
            console.log(`\n${errorCount} error(s) across ${result.files} blueprint(s).`);
            process.exit(result.exitCode);
        }
        catch (error) {
            handleDocsError(error);
        }
    });
}
//# sourceMappingURL=docs.js.map