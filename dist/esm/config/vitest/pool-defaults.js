/**
 * Shared pool/worker configuration defaults.
 *
 * Centralizes shared-runner detection, env var overrides, Stryker compatibility,
 * and execArgv logic used by node.ts, react.ts, and react-router.ts.
 */
import { cpus } from 'node:os';
// Shared workspace runners need tighter worker caps to avoid oversubscription.
// `VP_RUN_CONCURRENCY_LIMIT` is the native Vite+ knob for shared task scheduling.
const underSharedWorkspaceRunner = !!process.env.VP_RUN_CONCURRENCY_LIMIT;
// Under a shared runner, default to a single Vitest worker per package.
// The workspace runner already provides outer parallelism, and allowing many
// inner fork workers causes frequent shutdown timeouts and EPIPE crashes on
// large happy-dom / integration suites.
const MAX_WORKERS = underSharedWorkspaceRunner ? 1 : Math.max(1, Math.floor(cpus().length * 0.75));
const parsePositiveInt = (value) => {
    if (!value)
        return;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};
const requestedPool = process.env.VITEST_POOL;
const disableExecArgv = process.env.VITEST_DISABLE_EXEC_ARGV === '1';
const forcedMaxWorkers = parsePositiveInt(process.env.VITEST_MAX_WORKERS);
const forcedMinWorkers = parsePositiveInt(process.env.VITEST_MIN_WORKERS);
const isStryker = process.env.STRYKER_MUTATOR_WORKER !== undefined;
// Stryker's Vitest runner forces pool: 'threads' which rejects Node execArgv flags.
// Auto-clear execArgv to prevent ERR_WORKER_INVALID_EXEC_ARGV crashes.
// See: https://vitest.dev/config/pool.html#threads
export const resolvedPool = requestedPool === 'threads' ? 'threads' : 'forks';
export const resolvedMaxWorkers = forcedMaxWorkers ?? MAX_WORKERS;
export const resolvedMinWorkers = forcedMinWorkers ?? 1;
// --max-old-space-size=1536: Cap V8 heap to 1.5GB (Node 24 default is 4.2GB).
// Actual worker RSS is 100-230MB; 1.5GB is 6× headroom while reducing phys_footprint
// (macOS jetsam counts 2-3× RSS). Prevents runaway heap growth from keeping GC lazy.
// --no-experimental-webstorage: Node 24+ enables Web Storage API by default, which emits
// "Warning: `--localstorage-file` was provided without a valid path" in fork workers.
// Tests mock localStorage themselves; the built-in implementation is not needed.
// See: https://github.com/nodejs/node/issues/60303
export const resolvedExecArgv = disableExecArgv || resolvedPool === 'threads' || isStryker
    ? []
    : ['--max-old-space-size=1536', '--no-experimental-webstorage'];
//# sourceMappingURL=pool-defaults.js.map