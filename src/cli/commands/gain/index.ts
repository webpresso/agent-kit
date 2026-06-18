import type { CAC } from 'cac'
import { spawnSync } from 'node:child_process'

import { SessionMemoryStore } from '#session-memory/store.js'
import type { SessionGainStats } from '#session-memory/gain-types.js'
import { defaultIndexDbPath } from '#mcp/tools/session-restore.js'

interface RtkGainJson {
  readonly tokens_saved?: number
  readonly tokensSaved?: number
  readonly bytes_saved?: number
  readonly bytesSaved?: number
  readonly [key: string]: unknown
}

export interface RunGainOptions {
  readonly cwd?: string
  readonly indexDbPath?: string
}

export function runGain(options: RunGainOptions = {}): number {
  const dbPath = options.indexDbPath ?? defaultIndexDbPath(options.cwd)
  const webpressoStats = readWebpressoGainStats(dbPath)
  printWebpressoGain(webpressoStats, dbPath)

  console.log('\n── RTK Token Savings ──────────────────────────────────────────')
  const rtk = spawnSync('rtk', ['gain', '--format', 'json'], { encoding: 'utf8' })
  if (rtk.error) {
    const err = rtk.error
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      console.log('  RTK not installed.')
      console.log('  Enable: wp setup --with rtk  |  Manual: brew install rtk')
      return 0
    }
    throw err
  }

  if (rtk.status === 0) {
    printRtkGain(rtk.stdout)
  } else {
    if (rtk.stderr.trim()) console.log(indent(rtk.stderr.trim()))
    console.log('  RTK gain unavailable; Webpresso totals above were not merged with RTK.')
  }

  return rtk.status ?? 0
}

export function registerGainCommand(cli: CAC): void {
  cli.command('gain', 'Show Webpresso session gain and RTK token savings').action(() => runGain())
}

function readWebpressoGainStats(dbPath: string): SessionGainStats {
  const store = new SessionMemoryStore(dbPath)
  try {
    return store.gainStats()
  } finally {
    store.close()
  }
}

function printWebpressoGain(stats: SessionGainStats, dbPath: string): void {
  console.log('\n── Webpresso Session Gain ─────────────────────────────────────')
  console.log(`  Source: ${dbPath}`)
  console.log(`  Gain events: ${stats.eventCount}`)
  console.log(`  Raw basis bytes: ${stats.rawBasisBytes}`)
  console.log(`  Returned tool-result bytes: ${stats.returnedToolResultBytes}`)
  console.log(`  Exact UTF-8 gain bytes: ${stats.gainBytes}`)
  console.log(`  Approx tokens saved (bytes/4): ${stats.approxTokensSaved}`)
  if (stats.byTool.length === 0) {
    console.log('  By tool: none yet')
    return
  }
  console.log('  By tool:')
  for (const tool of stats.byTool) {
    console.log(
      `    ${tool.toolName}: ${tool.gainBytes} bytes, ~${tool.approxTokensSaved} tokens (${tool.eventCount} event${tool.eventCount === 1 ? '' : 's'})`,
    )
  }
}

function printRtkGain(stdout: string): void {
  const trimmed = stdout.trim()
  if (!trimmed) {
    console.log('  RTK returned no gain JSON.')
    return
  }
  try {
    const parsed = JSON.parse(trimmed) as RtkGainJson
    const tokens = parsed.tokens_saved ?? parsed.tokensSaved
    const bytes = parsed.bytes_saved ?? parsed.bytesSaved
    if (typeof tokens === 'number') console.log(`  RTK tokens saved: ${tokens}`)
    if (typeof bytes === 'number') console.log(`  RTK bytes saved: ${bytes}`)
    if (typeof tokens !== 'number' && typeof bytes !== 'number') {
      console.log(`  RTK JSON: ${trimmed}`)
    }
  } catch {
    console.log('  RTK returned non-JSON output:')
    console.log(indent(trimmed))
  }
}

function indent(text: string): string {
  return text
    .split(/\r?\n/u)
    .map((line) => `  ${line}`)
    .join('\n')
}
