/**
 * Runtime detection for tools that agent-kit consumers commonly need
 * but that `wp setup` cannot install for them (curl-pipe install scripts
 * or system package managers shouldn't be triggered silently).
 *
 * Auto-runs at the end of `wp setup`; prints a one-line status per
 * runtime so the consumer knows what's missing without surprising them
 * with a download.
 */
import { spawnSync } from 'node:child_process';
function probeVersion(cmd, args = ['--version']) {
    const r = spawnSync(cmd, args, { encoding: 'utf8' });
    if (r.error || (r.status !== null && r.status !== 0))
        return null;
    return r.stdout.trim().split('\n')[0] ?? null;
}
export const DEFAULT_PROBES = [
    {
        name: 'bun',
        detect: () => probeVersion('bun'),
        hint: 'curl -fsSL https://bun.sh/install | bash   (or `brew install oven-sh/bun/bun`)',
    },
    {
        name: 'vp',
        detect: () => probeVersion('vp'),
        hint: 'install vite-plus per your package manager (vp powers ingest-lens-style workspaces)',
    },
];
export function checkRuntimes(probes = DEFAULT_PROBES) {
    return probes.map((p) => ({ name: p.name, version: p.detect(), hint: p.hint }));
}
//# sourceMappingURL=index.js.map