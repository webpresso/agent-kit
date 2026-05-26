import { spawnSync } from 'node:child_process';
const NOT_FOUND_HINT = 'codex is not on PATH after `vp install -g @openai/codex`. Install it manually and re-run.';
export function ensureCodexCli(input) {
    if (input.options.dryRun)
        return { kind: 'codex-cli-skipped-dry-run' };
    const spawn = input.spawn ?? spawnSync;
    let installed = false;
    let probe = spawn('codex', ['--version'], { encoding: 'utf8' });
    if (probe.error || (probe.status !== null && probe.status !== 0)) {
        const install = spawn('vp', ['install', '-g', '@openai/codex'], { stdio: 'inherit' });
        if (install.status !== 0)
            return { kind: 'codex-cli-unavailable', hint: NOT_FOUND_HINT };
        installed = true;
        probe = spawn('codex', ['--version'], { encoding: 'utf8' });
        if (probe.error || (probe.status !== null && probe.status !== 0)) {
            return { kind: 'codex-cli-unavailable', hint: NOT_FOUND_HINT };
        }
    }
    else {
        spawn('vp', ['update', '-g', '@openai/codex'], { stdio: 'inherit' });
    }
    return { kind: 'codex-cli-ok', installed };
}
//# sourceMappingURL=index.js.map