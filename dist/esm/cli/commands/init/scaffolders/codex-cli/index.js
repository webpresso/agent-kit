import { spawnSync } from 'node:child_process';
import { isPackageLifecycleEnvironment } from '#cli/auto-update/skip.js';
import { appendGlobalCapableVpArgs, resolveGlobalCapableVpCommand, } from '#cli/global-vp.js';
const NOT_FOUND_HINT = 'codex is not on PATH after `vp install -g @openai/codex`. Install it manually and re-run.';
function shouldSkipCodexRefresh(env = process.env) {
    return env.WP_SKIP_UPDATE_CHECK === '1' || isPackageLifecycleEnvironment(env);
}
export function ensureCodexCli(input) {
    if (input.options.dryRun)
        return { kind: 'codex-cli-skipped-dry-run' };
    const env = input.env ?? process.env;
    if (isPackageLifecycleEnvironment(env))
        return { kind: 'codex-cli-skipped-package-lifecycle' };
    const spawn = input.spawn ?? spawnSync;
    const vpCommand = input.resolveVpCommand !== undefined
        ? input.resolveVpCommand()
        : resolveGlobalCapableVpCommand(env.PATH ?? '');
    let installed = false;
    let probe = spawn('codex', ['--version'], { encoding: 'utf8' });
    if (probe.error || (probe.status !== null && probe.status !== 0)) {
        if (vpCommand === null)
            return { kind: 'codex-cli-unavailable', hint: NOT_FOUND_HINT };
        const installCommand = appendGlobalCapableVpArgs(vpCommand, ['install', '-g', '@openai/codex']);
        const install = spawn(installCommand[0], installCommand.slice(1), { stdio: 'inherit' });
        if (install.status !== 0)
            return { kind: 'codex-cli-unavailable', hint: NOT_FOUND_HINT };
        installed = true;
        probe = spawn('codex', ['--version'], { encoding: 'utf8' });
        if (probe.error || (probe.status !== null && probe.status !== 0)) {
            return { kind: 'codex-cli-unavailable', hint: NOT_FOUND_HINT };
        }
    }
    else if (!shouldSkipCodexRefresh(env)) {
        // `--latest` ignores the recorded semver range so the global is pulled to
        // the absolute newest published release, matching the force-to-latest
        // guarantee `vp install -g <bare>` gives the agent-kit self-update. Plain
        // `vp update -g` is range-bound and can strand the global on an old major.
        if (vpCommand !== null) {
            const updateCommand = appendGlobalCapableVpArgs(vpCommand, [
                'update',
                '-g',
                '--latest',
                '@openai/codex',
            ]);
            spawn(updateCommand[0], updateCommand.slice(1), { stdio: 'inherit' });
        }
    }
    return { kind: 'codex-cli-ok', installed };
}
//# sourceMappingURL=index.js.map