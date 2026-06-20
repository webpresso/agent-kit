/**
 * Webpresso-owned curated gstack-derived skill installer.
 *
 * V1 no longer clones or pulls the upstream checkout. It copies allowlisted,
 * provenance-backed Markdown skill sources shipped with @webpresso/agent-kit
 * into user skill roots. Removing an old external checkout is explicit only.
 */
import { existsSync, mkdirSync, cpSync, renameSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import type { MergeOptions } from '#cli/commands/init/merge'
import { resolveAgentKitPackageRoot } from '#cli/commands/init/package-root'

import { auditGstackSkillCollisions, WEBPRESSO_GSTACK_SKILLS, type GstackSkillCollision } from './collision-audit.js'

export interface EnsureGstackInput {
  repoRoot: string
  options: MergeOptions
  /** Legacy external checkout path, used only for explicit cleanup. */
  installRoot?: string
  claudeSkillsRoot?: string
  codexConfigPath?: string
  codexSkillsRoot?: string
  packageRoot?: string | null
  exists?: typeof existsSync
  mkdir?: typeof mkdirSync
  readFile?: typeof readFileSync
  writeFile?: typeof writeFileSync
  cp?: typeof cpSync
  rename?: typeof renameSync
  rm?: typeof rmSync
  detectCodex?: (input: { exists: typeof existsSync; codexConfigPath: string }) => boolean
  env?: NodeJS.ProcessEnv
  log?: (message: string) => void
  now?: () => number
}

export type GstackCodexResult =
  | { kind: 'gstack-codex-installed'; skillsRoot: string }
  | { kind: 'gstack-codex-updated'; skillsRoot: string }
  | { kind: 'gstack-codex-already-configured'; skillsRoot: string }
  | { kind: 'gstack-codex-skipped'; reason: 'not-detected' | 'not-requested'; skillsRoot: string }

export type EnsureGstackResult =
  | { kind: 'gstack-installed'; root: string; codex: GstackCodexResult; collisions?: GstackSkillCollision[] }
  | { kind: 'gstack-updated'; root: string; codex: GstackCodexResult; collisions?: GstackSkillCollision[] }
  | { kind: 'gstack-already-configured'; root: string; codex: GstackCodexResult; collisions?: GstackSkillCollision[] }
  | { kind: 'gstack-skipped-dry-run' }
  | { kind: 'gstack-setup-failed'; command: 'webpresso-skill-install'; exitCode: number; reason: 'collision' | 'missing-package-assets' | 'exit-nonzero' | 'inactivity-timeout' | 'signal-interrupted'; logPath: string; collisions?: GstackSkillCollision[] }
  | { kind: 'gstack-clone-failed'; exitCode: number; reason: 'exit-nonzero' | 'inactivity-timeout' | 'signal-interrupted'; logPath: string }
  | { kind: 'gstack-pull-failed'; exitCode: number; reason: 'exit-nonzero' | 'inactivity-timeout' | 'signal-interrupted'; logPath: string }

function defaultExternalCheckoutRoot(): string {
  return path.join(process.env.HOME || homedir(), '.claude', 'skills', 'gstack')
}

function defaultClaudeSkillsRoot(): string {
  return path.join(process.env.HOME || homedir(), '.claude', 'skills')
}

function defaultCodexConfigPath(): string {
  return path.join(process.env.HOME || homedir(), '.codex', 'config.toml')
}

function defaultCodexSkillsRoot(): string {
  return path.join(process.env.HOME || homedir(), '.codex', 'skills')
}

function defaultDetectCodex(input: { exists: typeof existsSync; codexConfigPath: string }): boolean {
  return input.exists(input.codexConfigPath)
}

function resolveCatalogSkillsRoot(packageRoot: string | null | undefined): string | null {
  const root = packageRoot ?? resolveAgentKitPackageRoot({ moduleUrl: import.meta.url })
  return root ? path.join(root, 'catalog', 'agent', 'skills') : null
}

function hasInstalledWebpressoSkills(root: string, exists: typeof existsSync): boolean {
  return WEBPRESSO_GSTACK_SKILLS.every((name) => exists(path.join(root, name, 'SKILL.md')))
}

function installSkills(input: {
  sourceRoot: string
  targetRoot: string
  mkdir: typeof mkdirSync
  cp: typeof cpSync
  exists: typeof existsSync
}): 'installed' | 'updated' {
  const hadAll = hasInstalledWebpressoSkills(input.targetRoot, input.exists)
  input.mkdir(input.targetRoot, { recursive: true })
  for (const name of WEBPRESSO_GSTACK_SKILLS) {
    const source = path.join(input.sourceRoot, name, 'SKILL.md')
    if (!input.exists(source)) throw new Error(`missing staged skill asset: ${source}`)
    const targetDir = path.join(input.targetRoot, name)
    input.mkdir(targetDir, { recursive: true })
    input.cp(source, path.join(targetDir, 'SKILL.md'), { force: true })
  }
  return hadAll ? 'updated' : 'installed'
}

export function cleanupExternalGstackCheckout(input: {
  externalRoot: string
  dryRun: boolean
  explicit: boolean
  exists?: typeof existsSync
  mkdir?: typeof mkdirSync
  rename?: typeof renameSync
  rm?: typeof rmSync
  now?: () => number
}): { kind: 'skipped-not-present' | 'refused' | 'dry-run' | 'backed-up'; backupPath?: string; path: string } {
  const exists = input.exists ?? existsSync
  if (!exists(input.externalRoot)) return { kind: 'skipped-not-present', path: input.externalRoot }
  if (!input.explicit) return { kind: 'refused', path: input.externalRoot }
  if (input.dryRun) return { kind: 'dry-run', path: input.externalRoot }
  const mkdir = input.mkdir ?? mkdirSync
  const rename = input.rename ?? renameSync
  const stamp = new Date(input.now?.() ?? Date.now()).toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const backupPath = `${input.externalRoot}.backup-${stamp}`
  mkdir(path.dirname(backupPath), { recursive: true })
  rename(input.externalRoot, backupPath)
  return { kind: 'backed-up', path: input.externalRoot, backupPath }
}

export async function ensureGstack(input: EnsureGstackInput): Promise<EnsureGstackResult> {
  if (input.options.dryRun) return { kind: 'gstack-skipped-dry-run' }

  const exists = input.exists ?? existsSync
  const mkdir = input.mkdir ?? mkdirSync
  const cp = input.cp ?? cpSync
  const env = input.env ?? process.env
  const log = input.log ?? console.log
  const claudeSkillsRoot = input.claudeSkillsRoot ?? defaultClaudeSkillsRoot()
  const codexSkillsRoot = input.codexSkillsRoot ?? defaultCodexSkillsRoot()
  const codexConfigPath = input.codexConfigPath ?? defaultCodexConfigPath()
  const externalRoot = input.installRoot ?? defaultExternalCheckoutRoot()
  const sourceRoot = resolveCatalogSkillsRoot(input.packageRoot)

  if (!sourceRoot || !exists(sourceRoot)) {
    return { kind: 'gstack-setup-failed', command: 'webpresso-skill-install', exitCode: 1, reason: 'missing-package-assets', logPath: sourceRoot ?? 'unresolved-package-root' }
  }

  const codexDetected = (input.detectCodex ?? defaultDetectCodex)({ exists, codexConfigPath })
  const collisions = auditGstackSkillCollisions({ claudeSkillsRoot, codexSkillsRoot, exists, readFile: input.readFile })
  if (collisions.length > 0) {
    return { kind: 'gstack-setup-failed', command: 'webpresso-skill-install', exitCode: 1, reason: 'collision', logPath: 'skill-collision-audit', collisions }
  }

  const claudeState = installSkills({ sourceRoot, targetRoot: claudeSkillsRoot, mkdir, cp, exists })
  const codexState = codexDetected
    ? installSkills({ sourceRoot, targetRoot: codexSkillsRoot, mkdir, cp, exists })
    : null

  const cleanup = cleanupExternalGstackCheckout({
    externalRoot,
    dryRun: false,
    explicit: env.WP_GSTACK_CLEANUP_EXTERNAL === '1',
    exists,
    mkdir,
    rename: input.rename,
    now: input.now,
  })
  if (cleanup.kind === 'refused') {
    log(`  gstack: external checkout left in place at ${cleanup.path}; set WP_GSTACK_CLEANUP_EXTERNAL=1 to back it up and retire it.`)
  } else if (cleanup.kind === 'backed-up') {
    log(`  gstack: external checkout backed up to ${cleanup.backupPath}`)
  }

  const codex: GstackCodexResult = codexDetected
    ? codexState === 'updated'
      ? { kind: 'gstack-codex-updated', skillsRoot: codexSkillsRoot }
      : { kind: 'gstack-codex-installed', skillsRoot: codexSkillsRoot }
    : { kind: 'gstack-codex-skipped', reason: 'not-detected', skillsRoot: codexSkillsRoot }

  return claudeState === 'updated'
    ? { kind: 'gstack-updated', root: claudeSkillsRoot, codex }
    : { kind: 'gstack-installed', root: claudeSkillsRoot, codex }
}
