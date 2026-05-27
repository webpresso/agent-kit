import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { makeNoopSpinnerFactory } from '#cli/commands/init/scaffolders/spinner';
import { checkVersionPin } from '#cli/commands/init/scaffolders/version-pin';
const NOT_FOUND_HINT = 'rtk is not on PATH. Install it manually (macOS: `brew install rtk`) and re-run.';
export function ensureRtk(input) {
    if (input.options.dryRun)
        return { kind: 'rtk-skipped-dry-run' };
    const spawn = input.spawn ?? spawnSync;
    const spinner = (input.spinnerFactory ?? makeNoopSpinnerFactory())('rtk');
    let installed = false;
    spinner.start();
    let probe = spawn('rtk', ['--version'], { encoding: 'utf8' });
    if (probe.error || (probe.status !== null && probe.status !== 0)) {
        if (process.platform !== 'darwin') {
            spinner.fail('rtk not found');
            return { kind: 'rtk-not-found', hint: NOT_FOUND_HINT };
        }
        const install = spawn('brew', ['install', 'rtk'], { stdio: 'inherit' });
        if (install.status !== 0) {
            spinner.fail('rtk install failed');
            return { kind: 'rtk-not-found', hint: NOT_FOUND_HINT };
        }
        installed = true;
        probe = spawn('rtk', ['--version'], { encoding: 'utf8' });
        if (probe.error || (probe.status !== null && probe.status !== 0)) {
            spinner.fail('rtk not found after install');
            return { kind: 'rtk-not-found', hint: NOT_FOUND_HINT };
        }
    }
    const installedVersion = String(probe.stdout ?? '').trim();
    const pinCheck = checkVersionPin('rtk', installedVersion, input.pinFilePath ?? join(input.repoRoot, 'compatible-versions.json'));
    if (!pinCheck.ok) {
        if (input.strict) {
            spinner.fail('rtk version mismatch');
            return { kind: 'rtk-init-failed', exitCode: -1 };
        }
        console.warn(pinCheck.warning);
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
        spinner.fail('rtk init failed');
        return { kind: 'rtk-init-failed', exitCode: result.status ?? -1 };
    }
    spinner.succeed('rtk ready');
    return { kind: 'rtk-ok', installed };
}
//# sourceMappingURL=index.js.map