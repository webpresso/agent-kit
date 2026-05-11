import type { CAC } from 'cac'

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { flattenAgentDir, writeFlattenedAssets } from '#compiler/flatten'

const PINNED_RULESYNC_VERSION = '8.15.1'
const DEFAULT_TARGETS = 'claude,codex,cursor,gemini,opencode,windsurf'

export interface CompileResult {
  readonly ok: boolean
  readonly targets: readonly string[]
  readonly noOp: boolean
  readonly message: string
}

function resolveRulesyncBin(cwd: string): string {
  return join(cwd, 'node_modules', '.bin', 'rulesync')
}

function readRulesyncVersion(cwd: string): string | null {
  const pkgPath = join(cwd, 'node_modules', 'rulesync', 'package.json')
  if (!existsSync(pkgPath)) return null
  try {
    const parsed = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>
    return typeof parsed.version === 'string' ? parsed.version : null
  } catch { return null }
}

function contentHash(assets: { skills: Readonly<Record<string, string>>; commands: Readonly<Record<string, string>>; agents: Readonly<Record<string, string>> }): string {
  const entries = [
    ...Object.entries(assets.skills).map(([k, v]) => `s:${k}:${v}`),
    ...Object.entries(assets.commands).map(([k, v]) => `c:${k}:${v}`),
    ...Object.entries(assets.agents).map(([k, v]) => `a:${k}:${v}`),
  ]
  entries.sort()
  return entries.join('\0')
}

function readHashFile(p: string): string | null {
  if (!existsSync(p)) return null
  try { return readFileSync(p, 'utf-8').trim() } catch { return null }
}

export async function runCompile(options: { cwd: string; targets: string }): Promise<CompileResult> {
  const { cwd, targets } = options
  const targetList = targets.split(',').map((t) => t.trim()).filter(Boolean)
  const agentDir = join(cwd, '.agent')
  const lockPath = join(agentDir, '.compile.lock')
  const hashPath = join(agentDir, '.compile.hash')
  const rulesyncBin = resolveRulesyncBin(cwd)

  if (!existsSync(rulesyncBin)) {
    return { ok: false, targets: targetList, noOp: false, message: 'rulesync is not installed — run `pnpm add rulesync@8.15.1`' }
  }

  const installedVersion = readRulesyncVersion(cwd)
  if (installedVersion !== null && installedVersion !== PINNED_RULESYNC_VERSION) {
    process.stderr.write(`ak compile: warning — installed rulesync@${installedVersion} does not match pinned @${PINNED_RULESYNC_VERSION}\n`)
  }

  // Atomic lock via O_EXCL — fails if another compile is running
  try {
    writeFileSync(openSync(lockPath, 'ax'), String(process.pid))
  } catch {
    return { ok: false, targets: targetList, noOp: false, message: `ak compile: lock file exists at ${lockPath} — another compile is running` }
  }

  const cleanup = (): void => { try { if (existsSync(lockPath)) unlinkSync(lockPath) } catch { /* best-effort */ } }
  process.on('exit', cleanup)
  process.on('SIGINT', () => { cleanup(); process.exit(130) })
  process.on('SIGTERM', () => { cleanup(); process.exit(143) })

  try {
    const assets = flattenAgentDir(agentDir)
    const hash = contentHash(assets)
    if (readHashFile(hashPath) === hash) {
      return { ok: true, targets: targetList, noOp: true, message: 'ak compile: no-op (content unchanged)' }
    }

    // Write flattened assets to tmpdir then atomically rename to .rulesync/
    const tmpOut = mkdtempSync(join(tmpdir(), 'ak-compile-'))
    try {
      await writeFlattenedAssets(assets, tmpOut)
      const rulesyncInputDir = join(cwd, '.rulesync')
      if (existsSync(rulesyncInputDir)) rmSync(rulesyncInputDir, { recursive: true, force: true })
      renameSync(tmpOut, rulesyncInputDir)
    } catch (err) {
      rmSync(tmpOut, { recursive: true, force: true })
      throw err
    }

    const result = spawnSync(rulesyncBin, ['generate', '--targets', targets], { cwd, stdio: 'inherit' })
    if (result.error) {
      return { ok: false, targets: targetList, noOp: false, message: `ak compile: rulesync failed to start — ${result.error.message}` }
    }
    const exitCode = result.status ?? 1
    if (exitCode !== 0) {
      return { ok: false, targets: targetList, noOp: false, message: `ak compile: rulesync exited with code ${exitCode}` }
    }

    writeFileSync(hashPath, hash)
    return { ok: true, targets: targetList, noOp: false, message: `ak compile: generated for targets [${targetList.join(', ')}]` }
  } finally {
    cleanup()
  }
}

export function registerCompileCommand(cli: CAC): void {
  cli
    .command('compile', 'Compile .agent/ assets and run rulesync generate for target IDEs')
    .option('--targets <list>', `Comma-separated list of IDE targets (default: ${DEFAULT_TARGETS})`)
    .action(async (options: Record<string, unknown>) => {
      const targets = typeof options.targets === 'string' ? options.targets : DEFAULT_TARGETS
      const result = await runCompile({ cwd: resolve(process.cwd()), targets })
      if (!result.ok) { console.error(result.message); return 1 }
      console.log(result.message)
      return 0
    })
}
