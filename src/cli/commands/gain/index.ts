import type { CAC } from 'cac'
import { spawnSync } from 'node:child_process'

export function runGain(): number {
  // ── RTK Token Savings ───────────────────────────────────────────────
  console.log('\n── RTK Token Savings ──────────────────────────────────────────')
  const rtk = spawnSync('rtk', ['gain'], { stdio: 'inherit' })
  if (rtk.error) {
    const err = rtk.error
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      console.log('  RTK not installed.')
      console.log('  Enable: wp setup --with rtk  |  Manual: brew install rtk')
    } else {
      throw err
    }
  }

  return rtk.error ? 0 : (rtk.status ?? 0)
}

export function registerGainCommand(cli: CAC): void {
  cli.command('gain', 'Show RTK token savings').action(() => runGain())
}
