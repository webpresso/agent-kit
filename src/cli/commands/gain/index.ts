import type { CAC } from 'cac'

import { spawnSync } from 'node:child_process'

export function runGain(): number {
  const result = spawnSync('rtk', ['gain'], { stdio: 'inherit' })
  if (result.error) {
    const err = result.error
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      console.log('RTK not installed. Run `ak setup --with rtk` to enable token savings tracking.')
      console.log('Install manually: brew install rtk (macOS) or cargo install rtk (Linux)')
      return 0
    }
    throw err
  }
  return result.status ?? 0
}

export function registerGainCommand(cli: CAC): void {
  cli
    .command('gain', 'Show token savings from RTK (Rust Token Killer)')
    .action(() => {
      return runGain()
    })
}
