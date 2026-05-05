/**
 * Pure core for `ak cursor-windsurf-sync` — no process.exit, no console.log.
 *
 * Reads .md skill files from sourceDir and copies them to each targetDir.
 * Returns a structured report of copied and skipped files. All I/O injected.
 */

import path from 'node:path'

export interface SyncReport {
  copied: Array<{ src: string; dst: string }>
  skipped: Array<{ path: string; reason: string }>
}

type ReadDirFn = (dir: string) => Promise<string[]>
type CopyFileFn = (src: string, dst: string) => Promise<void>
type MkdirFn = (dir: string, opts: { recursive: boolean }) => Promise<void>

interface SyncDeps {
  readDir?: ReadDirFn
  copyFile?: CopyFileFn
  mkdir?: MkdirFn
}

async function defaultReadDir(dir: string): Promise<string[]> {
  const { readdirSync } = await import('node:fs')
  return readdirSync(dir)
}

async function defaultCopyFile(src: string, dst: string): Promise<void> {
  const { copyFileSync } = await import('node:fs')
  copyFileSync(src, dst)
}

async function defaultMkdir(dir: string, opts: { recursive: boolean }): Promise<void> {
  const { mkdirSync } = await import('node:fs')
  mkdirSync(dir, opts)
}

export async function syncCursorWindsurfSkills(
  sourceDir: string,
  targetDirs: string[],
  deps: SyncDeps = {},
): Promise<SyncReport> {
  const readDir = deps.readDir ?? defaultReadDir
  const copyFile = deps.copyFile ?? defaultCopyFile
  const mkdir = deps.mkdir ?? defaultMkdir

  const report: SyncReport = { copied: [], skipped: [] }

  let entries: string[]
  try {
    entries = await readDir(sourceDir)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    report.skipped.push({ path: sourceDir, reason: `readDir failed: ${reason}` })
    return report
  }

  const skillFiles = entries.filter((name) => name.endsWith('.md'))

  for (const targetDir of targetDirs) {
    await mkdir(targetDir, { recursive: true })

    for (const name of skillFiles) {
      const src = path.join(sourceDir, name)
      const dst = path.join(targetDir, name)
      try {
        await copyFile(src, dst)
        report.copied.push({ src, dst })
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        report.skipped.push({ path: src, reason })
      }
    }
  }

  return report
}
