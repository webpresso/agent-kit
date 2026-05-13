/**
 * `ak sync` — projects the canonical agent-kit rule/skill catalog into the
 * supported host surfaces.
 *
 * Projects unified rule + skill content (catalog ∪ consumer) into per-IDE
 * surfaces according to `DEFAULT_UNIFIED_CONSUMERS`.
 *
 * Flags:
 *   --kind rules|skills   Filter to a single kind (default: both).
 *   --check               Dry-run; exit 1 on first drift, no writes.
 */
import { runUnifiedSync } from '#symlinker/unified-sync';
import { resolvePackageAsset } from '#utils/package-assets';
function commandError(message, exitCode = 1) {
    const err = new Error(message);
    err.exitCode = exitCode;
    return err;
}
function parseKind(input) {
    if (input === undefined)
        return undefined;
    if (input === 'rules' || input === 'rule')
        return ['rule'];
    if (input === 'skills' || input === 'skill')
        return ['skill'];
    throw commandError(`Invalid --kind: ${input}. Must be 'rules' or 'skills'.`);
}
function formatMismatches(mismatches) {
    return mismatches.map((m) => `  - [${m.consumerId}] ${m.targetPath}: ${m.reason}`).join('\n');
}
export function registerSyncCommand(cli) {
    cli
        .command('sync', 'Sync agent rules + skills across all supported host surfaces')
        .option('--kind <kind>', 'Filter: rules | skills (default: both)')
        .option('--check', 'Exit 1 on drift; no writes')
        .action(async (options = {}) => {
        const kinds = parseKind(options.kind);
        const repoRoot = process.cwd();
        const catalogDir = resolvePackageAsset('catalog/agent');
        const check = options.check === true;
        let result;
        try {
            result = runUnifiedSync({
                catalogDir,
                consumerRoot: repoRoot,
                ...(kinds ? { kinds } : {}),
                check,
            });
        }
        catch (error) {
            if (error instanceof Error && /catalogDir does not exist/.test(error.message)) {
                throw commandError('ak sync: @webpresso/agent-kit not installed in node_modules. ' +
                    'Run `pnpm install` first.');
            }
            throw error;
        }
        if (check) {
            if (result.fixCount > 0) {
                const first = result.mismatches[0];
                if (first) {
                    console.error(`ak sync --check: drift detected at ${first.targetPath}`);
                    console.error(`  reason: ${first.reason}`);
                    console.error(`  consumer: ${first.consumerId}`);
                    if (result.mismatches.length > 1) {
                        console.error(`(${result.mismatches.length - 1} additional drift entries follow)`);
                        console.error(formatMismatches(result.mismatches.slice(1)));
                    }
                    console.error('\nRun `ak sync` to repair, then commit the changes.');
                }
                else {
                    console.error(`ak sync --check: ${result.fixCount} drift items detected.`);
                }
                return 1;
            }
            console.log('ak sync --check: in sync.');
            return 0;
        }
        if (result.fixCount === 0) {
            console.log('Already up to date.');
            return 0;
        }
        console.log(`ak sync: wrote ${result.fixCount} entries.`);
        console.log('Synced. Restart your IDE to load new rules/skills.');
        return 0;
    });
}
//# sourceMappingURL=sync.js.map