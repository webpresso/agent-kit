/**
 * Runtime detection for tools that webpresso consumers commonly need
 * but that `wp setup` cannot install for them (curl-pipe install scripts
 * or system package managers shouldn't be triggered silently).
 *
 * Auto-runs at the end of `wp setup`; prints a one-line status per
 * runtime so the consumer knows what's missing without surprising them
 * with a download.
 */
import { spawnSync } from 'node:child_process'

export interface RuntimeProbe {
  name: string
  /** Returns the version string if found, null otherwise. */
  detect: () => string | null
  /** Install hint shown when `detect()` returns null. */
  hint: string
}

export interface RuntimeStatus {
  name: string
  version: string | null
  hint: string
}

function probeVersion(cmd: string, args: string[] = ['--version']): string | null {
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  if (r.error || (r.status !== null && r.status !== 0)) return null
  return r.stdout.trim().split('\n')[0] ?? null
}

export const DEFAULT_PROBES: RuntimeProbe[] = [
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
  {
    name: 'actionlint',
    detect: () => probeVersion('actionlint'),
    hint: 'install actionlint (`brew install actionlint` or `go install github.com/rhysd/actionlint/cmd/actionlint@latest`)',
  },
]

export function checkRuntimes(probes: RuntimeProbe[] = DEFAULT_PROBES): RuntimeStatus[] {
  return probes.map((p) => ({ name: p.name, version: p.detect(), hint: p.hint }))
}
