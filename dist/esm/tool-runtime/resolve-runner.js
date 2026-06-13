import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const MANAGED_TOOL_PREFIX = {
    oxfmt: { packageName: 'oxfmt', binName: 'oxfmt' },
    oxlint: { packageName: 'oxlint', binName: 'oxlint' },
    playwright: { packageName: '@playwright/test', binName: 'playwright' },
    stryker: { packageName: '@stryker-mutator/core', binName: 'stryker' },
    tsc: { packageName: 'typescript', binName: 'tsc' },
    tsx: { packageName: 'tsx', binName: 'tsx' },
    vite: { packageName: 'vite', binName: 'vite' },
    vitest: { packageName: 'vitest', binName: 'vitest' },
    vp: { command: 'vp', args: [] },
    wrangler: { packageName: 'wrangler', binName: 'wrangler' },
};
let rtkAvailable = null;
// The real token-killer `rtk` exposes a `gain` analytics subcommand (see
// RTK.md); the unrelated `reachingforthejack/rtk` (Rust Type Kit) collision
// binary does not. Probe that capability instead of `--version`, which *any*
// `rtk` on PATH answers with exit 0 — trusting it would route wrapped commands
// (typecheck/qa/test gates) through a foreign binary that may mangle args or
// drop the wrapped exit code, masking a failing gate as green.
const RTK_CAPABILITY_ARGS = ['gain', '--help'];
// Measured cold cost of `rtk gain --help` is ~11ms; 3s is generous headroom.
// A probe that exceeds it is a broken or wrong binary, so degrade to unfiltered
// output rather than let a hung `rtk` stall every wrapped command (per
// no-timeout-as-fix: the bound surfaces the fault, it does not silence it).
const RTK_PROBE_TIMEOUT_MS = 3000;
function probeRtkAvailability() {
    if (rtkAvailable !== null)
        return rtkAvailable;
    try {
        const result = spawnSync('rtk', RTK_CAPABILITY_ARGS, {
            encoding: 'utf8',
            windowsHide: true,
            timeout: RTK_PROBE_TIMEOUT_MS,
        });
        // A timeout yields status === null (+ signal), so the strict === 0 check
        // already degrades on hang without a separate branch.
        rtkAvailable = result.status === 0;
    }
    catch {
        rtkAvailable = false;
    }
    return rtkAvailable;
}
export function setRtkAvailabilityProbeForTest(value) {
    rtkAvailable = value;
}
export function resolveOutputPolicy(outputPolicy, filterOutput) {
    return outputPolicy ?? (filterOutput === false ? 'structured' : 'rtk-filtered');
}
function withOptionalRtk(resolution, outputPolicy) {
    if (outputPolicy !== 'rtk-filtered')
        return resolution;
    if (!probeRtkAvailability())
        return resolution;
    return {
        ...resolution,
        command: 'rtk',
        args: [resolution.command, ...resolution.args],
    };
}
export function resolveRunner(tool, options = {}) {
    const normalized = tool.trim();
    if (!normalized) {
        throw new Error('tool runtime resolution requires a non-empty tool name');
    }
    const outputPolicy = resolveOutputPolicy(options.outputPolicy, options.filterOutput);
    const managed = MANAGED_TOOL_PREFIX[normalized];
    if (managed) {
        return withOptionalRtk(resolveManagedTool(normalized, managed), outputPolicy);
    }
    if (options.fallbackCommand) {
        return withOptionalRtk({
            tool: normalized,
            command: options.fallbackCommand,
            args: [...(options.fallbackArgs ?? [])],
            source: 'fallback',
        }, outputPolicy);
    }
    throw new Error(`No managed runtime runner is defined for tool "${normalized}"`);
}
function resolveManagedTool(tool, spec) {
    if ('command' in spec) {
        return { tool, command: spec.command, args: [...spec.args], source: 'managed' };
    }
    const binPath = resolvePackageBin(spec.packageName, spec.binName);
    if (binPath) {
        return { tool, command: binPath, args: [...(spec.fallbackArgs ?? [])], source: 'managed' };
    }
    return { tool, command: 'vp', args: ['exec', spec.binName], source: 'fallback' };
}
function resolvePackageBin(packageName, binName) {
    try {
        const packageJsonPath = require.resolve(`${packageName}/package.json`);
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        const relativeBin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.[binName];
        if (!relativeBin)
            return null;
        const absoluteBin = resolve(dirname(packageJsonPath), relativeBin);
        return existsSync(absoluteBin) ? absoluteBin : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=resolve-runner.js.map