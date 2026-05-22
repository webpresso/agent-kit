import { executeTechDebtSubcommand } from './router-dispatch.js';
export function registerTechDebtRouter(cli) {
    cli
        .command('tech-debt [subcommand] [...args]', 'Tech-debt lifecycle management (new, list, review)')
        .option('--severity <severity>', 'Severity level: critical|high|medium|low (for new)')
        .option('--category <category>', 'Category: complexity|testing|mutation|duplication|dependency|security|documentation (for new)')
        .option('--review-cadence <cadence>', 'Review cadence: weekly|biweekly|monthly|quarterly (for new)')
        .option('--status <status>', 'Status: accepted|needs-remediation|monitoring|resolved')
        .option('--dry-run', 'Print would-be path without writing (for new)')
        .option('--from-audit <audit>', 'Auto-file from audit findings: skill-sizes|broken-refs|memory-rotation (for new)')
        .option('--cwd <dir>', 'Consumer repo root (default: process.cwd())')
        .action(async (subcommand, args, options) => {
        if (!subcommand) {
            console.log([
                'Usage: wp tech-debt <subcommand> [options]',
                '',
                'Subcommands:',
                '  new "<title>" --severity <s> --category <c> [--review-cadence <r>] [--status <s>] [--dry-run]',
                '  list [--status <s>] [--severity <s>] [--category <c>]',
                '  review',
                '',
                'Options:',
                '  --cwd <dir>   Consumer repo root (default: process.cwd())',
            ].join('\n'));
            return;
        }
        await executeTechDebtSubcommand(subcommand, args, options);
    });
}
//# sourceMappingURL=router.js.map