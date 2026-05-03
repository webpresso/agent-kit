/**
 * `omx` scaffolder preset.
 *
 * Chains `omx setup --yes` after the agent-kit scaffold completes. OMX
 * (oh-my-codex) is the operator-workflow execution layer; it manages
 * its own scaffolding idempotently — we just verify it's on PATH and spawn it.
 *
 * Required when downstream features rely on `omx team` (see
 * `cli/commands/blueprint/execution.ts`).
 */
import { spawnSync } from 'node:child_process';
const NOT_FOUND_HINT = 'omx (oh-my-codex) is not on PATH. Install it and re-run, or omit `--with omx`.';
/**
 * Probe for `omx` on PATH then run `omx setup --yes` in the consumer repo.
 * Idempotent: safe to run on every `ak setup`.
 */
export function ensureOmx(input) {
    if (input.options.dryRun)
        return { kind: 'omx-skipped-dry-run' };
    const spawn = input.spawn ?? spawnSync;
    const probe = spawn('omx', ['--version'], { encoding: 'utf8' });
    if (probe.error || (probe.status !== null && probe.status !== 0)) {
        return { kind: 'omx-not-found', hint: NOT_FOUND_HINT };
    }
    const result = spawn('omx', ['setup', '--yes'], {
        cwd: input.repoRoot,
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        return { kind: 'omx-spawn-failed', exitCode: result.status ?? -1 };
    }
    return { kind: 'omx-ok' };
}
//# sourceMappingURL=index.js.map