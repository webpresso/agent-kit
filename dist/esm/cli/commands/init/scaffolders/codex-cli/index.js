import { spawnSync } from 'node:child_process';
import { resolveGlobalCapableVp } from '#cli/commands/init/scaffolders/vp-global.js';
const NOT_FOUND_HINT = 'codex is not on PATH after `vp install -g @openai/codex`. Install it manually and re-run.';
function shouldSkipCodexRefresh(env = process.env) {
    return env.WP_SKIP_UPDATE_CHECK === '1';
}
export function ensureCodexCli(input) {
    if (input.options.dryRun)
        return { kind: 'codex-cli-skipped-dry-run' };
    const spawn = input.spawn ?? spawnSync;
    const vpCommand = input.resolveVpCommand !== undefined ? input.resolveVpCommand() : resolveGlobalCapableVp();
    let installed = false;
    let probe = spawn('codex', ['--version'], { encoding: 'utf8' });
    if (probe.error || (probe.status !== null && probe.status !== 0)) {
        if (vpCommand === null)
            return { kind: 'codex-cli-unavailable', hint: NOT_FOUND_HINT };
        const install = spawn(vpCommand, ['install', '-g', '@openai/codex'], { stdio: 'inherit' });
        if (install.status !== 0)
            return { kind: 'codex-cli-unavailable', hint: NOT_FOUND_HINT };
        installed = true;
        probe = spawn('codex', ['--version'], { encoding: 'utf8' });
        if (probe.error || (probe.status !== null && probe.status !== 0)) {
            return { kind: 'codex-cli-unavailable', hint: NOT_FOUND_HINT };
        }
    }
    else if (!shouldSkipCodexRefresh() && vpCommand !== null) {
        // `--latest` ignores the recorded semver range so the global is pulled to
        // the absolute newest published release, matching the force-to-latest
        // guarantee `vp install -g <bare>` gives the agent-kit self-update. Plain
        // `vp update -g` is range-bound and can strand the global on an old major.
        spawn(vpCommand, ['update', '-g', '--latest', '@openai/codex'], { stdio: 'inherit' });
    }
    return { kind: 'codex-cli-ok', installed };
}
//# sourceMappingURL=index.js.map