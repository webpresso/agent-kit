/**
 * `ak sync` — single sync command that replaces the legacy
 * `ak symlink sync` and `ak cursor-windsurf-sync`.
 *
 * Projects unified rule + skill content (catalog ∪ consumer) into per-IDE
 * surfaces according to `DEFAULT_UNIFIED_CONSUMERS`. Also runs the existing
 * `syncAll` (commands, workflows, AGENTS.md, mcp.json, tail-IDE skill
 * fan-out) so the one command covers every surface.
 *
 * Flags:
 *   --kind rules|skills   Filter to a single kind (default: both).
 *   --check               Dry-run; exit 1 on first drift, no writes.
 */
import { syncAll } from '#symlinker';
import { runUnifiedSync } from '../../symlinker/unified-sync.js';
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
        .command('sync', 'Sync agent rules + skills (and tail surfaces) across all IDEs')
        .option('--kind <kind>', 'Filter: rules | skills (default: both)')
        .option('--check', 'Exit 1 on drift; no writes')
        .action(async (options = {}) => {
        const kinds = parseKind(options.kind);
        const repoRoot = process.cwd();
        const catalogDir = resolvePackageAsset('catalog/agent');
        const check = options.check === true;
        const result = runUnifiedSync({
            catalogDir,
            consumerRoot: repoRoot,
            ...(kinds ? { kinds } : {}),
            check,
        });
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
        // Non-check mode: also run the legacy tail-surface fan-out.
        // syncAll handles commands/workflows/AGENTS.md/mcp.json and the
        // existing `.agents/skills/` per-skill projection. It's idempotent.
        let tailFixes = 0;
        if (kinds === undefined) {
            // Only run tail surfaces for the full sync; --kind filters skip it
            // because they target a specific content kind only.
            tailFixes = syncAll(repoRoot);
        }
        const totalWrites = result.fixCount + tailFixes;
        if (totalWrites === 0) {
            console.log('Already up to date.');
            return 0;
        }
        console.log(`ak sync: wrote ${totalWrites} entries.`);
        console.log('Synced. Restart your IDE to load new rules/skills.');
        return 0;
    });
}
//# sourceMappingURL=sync.js.map