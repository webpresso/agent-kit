/**
 * `wp sync` — projects the canonical agent-kit rule/skill catalog into the
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
import { defaultConfig, readConfig } from './init/config.js';
import { detectConsumer } from './init/detect-consumer.js';
import { scaffoldAgentsMd } from './init/scaffold-agents-md.js';
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
function agentsResultToMismatch(result) {
    switch (result.action) {
        case 'identical':
            return null;
        case 'created':
        case 'overwritten':
            return {
                consumerId: 'agents-md',
                targetPath: result.targetPath,
                reason: 'managed AGENTS.md blocks drifted from the current agent-kit template',
            };
        case 'drifted':
            return {
                consumerId: 'agents-md',
                targetPath: result.targetPath,
                reason: 'AGENTS.md has no managed block markers; review the drift or rerun setup with overwrite once',
            };
        case 'skipped-dry':
            return {
                consumerId: 'agents-md',
                targetPath: result.targetPath,
                reason: 'managed AGENTS.md blocks would be refreshed',
            };
        default:
            return null;
    }
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
        const consumer = detectConsumer(repoRoot);
        if (!consumer) {
            throw commandError('wp sync: could not detect the current git repo root.');
        }
        const agentsResult = scaffoldAgentsMd({
            catalogDir: resolvePackageAsset('catalog'),
            repoRoot,
            consumer,
            config: readConfig(repoRoot) ?? defaultConfig(),
            options: { dryRun: check, overwrite: false },
        });
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
                throw commandError('wp sync: @webpresso/agent-kit not installed in node_modules. ' +
                    'Run `vp install` first.');
            }
            throw error;
        }
        const agentsMismatch = agentsResult === null ? null : agentsResultToMismatch(agentsResult);
        const combinedFixCount = result.fixCount + (agentsMismatch ? 1 : 0);
        const combinedMismatches = agentsMismatch
            ? [...result.mismatches, agentsMismatch]
            : [...result.mismatches];
        if (check) {
            if (combinedFixCount > 0) {
                const first = combinedMismatches[0];
                if (first) {
                    console.error(`wp sync --check: drift detected at ${first.targetPath}`);
                    console.error(`  reason: ${first.reason}`);
                    console.error(`  consumer: ${first.consumerId}`);
                    if (combinedMismatches.length > 1) {
                        console.error(`(${combinedMismatches.length - 1} additional drift entries follow)`);
                        console.error(formatMismatches(combinedMismatches.slice(1)));
                    }
                    console.error('\nRun `wp sync` to repair, then commit the changes.');
                }
                else {
                    console.error(`wp sync --check: ${combinedFixCount} drift items detected.`);
                }
                return 1;
            }
            console.log('wp sync --check: in sync.');
            return 0;
        }
        if (combinedFixCount === 0) {
            console.log('Already up to date.');
            return 0;
        }
        console.log(`wp sync: wrote ${combinedFixCount} entries.`);
        console.log('Synced. Restart your IDE to load new rules/skills.');
        return 0;
    });
}
//# sourceMappingURL=sync.js.map