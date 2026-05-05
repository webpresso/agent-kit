import { listBlueprints, showBlueprint } from './blueprint/router.js';
import { formatBlueprintDetails, formatBlueprintSummaries, printBlueprintOutput } from './blueprint/router-output.js';
const ROADMAP_HELP = [
    'ak roadmap',
    '',
    'Commands:',
    '  list [status]',
    '  show <slug>',
].join('\n');
export function getRoadmapHelpText() {
    return ROADMAP_HELP;
}
export function assertParentRoadmap(result) {
    if (result.blueprint.type !== 'parent-roadmap') {
        throw new Error(`Blueprint ${result.slug} is type=${result.blueprint.type}, not type=parent-roadmap. Use 'ak blueprint show ${result.slug}' instead.`);
    }
    return result;
}
export function registerRoadmapCommand(cli) {
    cli
        .command('roadmap [subcommand] [...args]', 'List or show parent roadmaps')
        .option('--json', 'Emit JSON output')
        .option('--project-root <path>', 'Override the project root')
        .action(async (subcommand, args, options) => {
        switch (subcommand) {
            case undefined:
                printBlueprintOutput(ROADMAP_HELP, false);
                return;
            case 'list': {
                if (args.length > 1) {
                    throw new Error('Usage: ak roadmap list [status]');
                }
                const summaries = await listBlueprints({
                    json: options.json,
                    onlyRoadmaps: true,
                    projectRoot: options.projectRoot,
                    status: args[0],
                });
                printBlueprintOutput(options.json ? summaries : formatBlueprintSummaries(summaries), options.json);
                return;
            }
            case 'show': {
                const slug = args[0];
                if (!slug) {
                    throw new Error('Usage: ak roadmap show <slug>');
                }
                const result = assertParentRoadmap(await showBlueprint(slug, { json: options.json, projectRoot: options.projectRoot }));
                printBlueprintOutput(options.json ? result : formatBlueprintDetails(result), options.json);
                return;
            }
            default:
                throw new Error(`Unknown roadmap subcommand: ${subcommand}\n\nUse one of: list, show`);
        }
    });
}
//# sourceMappingURL=roadmap.js.map