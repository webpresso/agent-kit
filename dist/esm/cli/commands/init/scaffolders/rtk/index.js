import { spawnSync } from 'node:child_process';
const NOT_FOUND_HINT = 'rtk is not on PATH. Install it manually (macOS: `brew install rtk`) and re-run.';
export function ensureRtk(input) {
    if (input.options.dryRun)
        return { kind: 'rtk-skipped-dry-run' };
    const spawn = input.spawn ?? spawnSync;
    let installed = false;
    let probe = spawn('rtk', ['--version'], { encoding: 'utf8' });
    if (probe.error || (probe.status !== null && probe.status !== 0)) {
        if (process.platform !== 'darwin') {
            return { kind: 'rtk-not-found', hint: NOT_FOUND_HINT };
        }
        const install = spawn('brew', ['install', 'rtk'], { stdio: 'inherit' });
        if (install.status !== 0) {
            return { kind: 'rtk-not-found', hint: NOT_FOUND_HINT };
        }
        installed = true;
        probe = spawn('rtk', ['--version'], { encoding: 'utf8' });
        if (probe.error || (probe.status !== null && probe.status !== 0)) {
            return { kind: 'rtk-not-found', hint: NOT_FOUND_HINT };
        }
    }
    const result = spawn('rtk', ['init', '-g', '--auto-patch'], {
        cwd: input.repoRoot,
        stdio: 'inherit',
        env: {
            ...process.env,
            RTK_TELEMETRY_DISABLED: '1',
        },
    });
    if (result.status !== 0) {
        return { kind: 'rtk-init-failed', exitCode: result.status ?? -1 };
    }
    return { kind: 'rtk-ok', installed };
}
//# sourceMappingURL=index.js.map