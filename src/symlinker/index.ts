#!/usr/bin/env node
/**
 * Audit & Auto-Fix: Agent Command/Workflow Symlinks
 *
 * Ensures all consumer directories (e.g. .claude/commands) use symlinks
 * pointing to `.agent/` source files, keeps skill directories as single
 * directory-symlinks, and regenerates `.gemini/commands/*.toml` from
 * markdown sources.
 *
 * Auto-fixes:
 * - Replaces real files with symlinks to .agent/ source
 * - Removes broken symlinks and recreates them
 * - Removes stale mirrored files when the .agent/ source no longer exists
 * - Creates missing symlinks for all .agent/ entries
 * - Removes symlinks pointing outside .agent/
 *
 * Usage:
 *   ak symlink sync            # Phase 2 — wires to syncAll
 *   node dist/symlinker/index  # direct invocation from built output
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

import { findRepoRoot } from '#utils/repo-root'

import {
  ALLOWED_REAL_FILES,
  type ConsumerConfig,
  DEFAULT_CONSUMERS,
  DEFAULT_SKILLS_CONSUMERS,
  type SkillsConsumerConfig,
} from './consumers'
import { parseMarkdownFrontmatter } from './frontmatter'
import { toToml } from './toml'

export {
  ALLOWED_REAL_FILES,
  type ConsumerConfig,
  DEFAULT_CONSUMERS,
  DEFAULT_SKILLS_CONSUMERS,
  type SkillsConsumerConfig,
}

export function isAgentOrConsumerFile(file: string): boolean {
  // Gemini TOML generated files
  if (/^\.gemini\/commands\/.+\.toml$/.test(file)) return true

  if (!file.endsWith('.md')) return false

  // .agent/ source markdown (commands, workflows, skills)
  if (/^\.agent\/(commands|workflows|skills)\/.+\.md$/.test(file)) return true

  // Mirrored consumer command/workflow directories
  for (const { dir } of DEFAULT_CONSUMERS) {
    if (file.startsWith(`${dir}/`)) return true
  }

  // Mirrored consumer skill directories (nested under skill subdirs)
  for (const { linkPath } of DEFAULT_SKILLS_CONSUMERS) {
    if (file.startsWith(`${linkPath}/`)) return true
  }

  return false
}

export function getAgentSources(repoRoot: string): Map<string, string> {
  const sources = new Map<string, string>()

  const commandsDir = join(repoRoot, '.agent/commands')
  if (existsSync(commandsDir)) {
    for (const commandFile of readdirSync(commandsDir).filter((fileName) =>
      fileName.endsWith('.md'),
    )) {
      sources.set(commandFile, `commands/${commandFile}`)
    }
  }

  const workflowsDir = join(repoRoot, '.agent/workflows')
  if (existsSync(workflowsDir)) {
    for (const workflowFile of readdirSync(workflowsDir).filter((fileName) =>
      fileName.endsWith('.md'),
    )) {
      sources.set(workflowFile, `workflows/${workflowFile}`)
    }
  }

  return sources
}

export function syncSkillsConsumer(repoRoot: string, config: SkillsConsumerConfig): number {
  const fullPath = join(repoRoot, config.linkPath)
  const parentDir = join(fullPath, '..')
  mkdirSync(parentDir, { recursive: true })

  console.log(`\n📁 ${config.linkPath}`)

  const stats = (() => {
    try {
      return lstatSync(fullPath)
    } catch {
      return null
    }
  })()

  if (stats) {
    if (stats.isSymbolicLink()) {
      const target = readlinkSync(fullPath)
      const resolvedTarget = resolve(parentDir, target)
      const isBroken = !existsSync(resolvedTarget)
      const isCorrect = target.replace(/\\/g, '/') === config.target

      if (!isBroken && isCorrect) {
        console.log('  ✅ Symlink correct')
        return 0
      }

      unlinkSync(fullPath)
      const reason = isBroken ? 'broken' : `wrong target (${target})`
      console.log(`  🔧 Removed ${reason} symlink`)
    } else {
      console.log(`  ⚠️  ${config.linkPath}: is a real directory — skipped (remove manually)`)
      return 0
    }
  }

  createSymlinkWithType(config.target, fullPath, 'dir', config.linkPath)
  console.log(`  ✅ ${config.linkPath} → ${config.target}`)
  return 1
}

export function syncSkills(
  repoRoot: string,
  consumers: SkillsConsumerConfig[] = DEFAULT_SKILLS_CONSUMERS,
): number {
  const skillsSource = join(repoRoot, '.agent/skills')
  if (!existsSync(skillsSource)) return 0

  let fixCount = 0
  for (const consumer of consumers) {
    fixCount += syncSkillsConsumer(repoRoot, consumer)
  }
  return fixCount
}

/**
 * Create a symlink with an explicit Windows type hint.
 *
 * On POSIX the `type` argument is ignored — symlinks carry no type. On
 * Windows, `fs.symlinkSync` without a type arg tries to auto-detect by
 * stat'ing the target; any failure there silently falls back to `'file'`,
 * which breaks directory symlinks. Passing the type explicitly is safe on
 * every platform and eliminates the Windows auto-detect failure mode.
 *
 * Windows also requires elevation or Developer Mode for symlink creation;
 * an EPERM failure here rethrows with a pointer to the fix instead of a
 * generic errno that's opaque to a first-time contributor.
 */
function createSymlinkWithType(
  target: string,
  linkPath: string,
  type: 'file' | 'dir',
  label: string,
): void {
  try {
    symlinkSync(target, linkPath, type)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (process.platform === 'win32' && code === 'EPERM') {
      throw new Error(
        `Cannot create symlink ${label} → ${target}: Windows denied permission. ` +
          'Enable Developer Mode (Settings → Privacy & security → For developers) ' +
          'or run this script from an elevated shell.',
        { cause: error },
      )
    }
    throw error
  }
}

export function createSymlink(
  repoRoot: string,
  consumerDir: string,
  file: string,
  symlinkTarget: string,
): void {
  const fullPath = join(repoRoot, consumerDir, file)
  createSymlinkWithType(symlinkTarget, fullPath, 'file', `${consumerDir}/${file}`)
  console.log(`  ✅ ${file} → ${symlinkTarget}`)
}

function removeAndRelink(
  repoRoot: string,
  consumerDir: string,
  file: string,
  symlinkTarget: string,
): void {
  const fullPath = join(repoRoot, consumerDir, file)
  unlinkSync(fullPath)
  createSymlinkWithType(symlinkTarget, fullPath, 'file', `${consumerDir}/${file}`)
}

export function fixExistingFile(
  repoRoot: string,
  config: ConsumerConfig,
  file: string,
  agentSources: Map<string, string>,
): boolean {
  const fullPath = join(repoRoot, config.dir, file)
  const stats = lstatSync(fullPath)
  const agentPath = agentSources.get(file)
  const expectedTarget = agentPath ? `${config.sourcePrefix}${agentPath}` : null

  if (!stats.isSymbolicLink()) {
    if (!expectedTarget) {
      console.log(`  ⚠️  ${file}: real file with no .agent/ source — skipped (move manually)`)
      return false
    }
    removeAndRelink(repoRoot, config.dir, file, expectedTarget)
    console.log(`  🔧 ${file}: replaced real file → ${expectedTarget}`)
    return true
  }

  const target = readlinkSync(fullPath)
  const normalizedTarget = target.replace(/\\/g, '/')
  const resolvedTarget = resolve(join(repoRoot, config.dir), target)
  const isBroken = !existsSync(resolvedTarget)
  const isOutsideAgent = !normalizedTarget.includes('.agent/')
  const isWrongTarget = expectedTarget !== null && normalizedTarget !== expectedTarget

  if (!isBroken && !isOutsideAgent && !isWrongTarget) return false

  if (!expectedTarget) {
    unlinkSync(fullPath)
    console.log(`  🗑️  ${file}: removed broken symlink (no .agent/ source)`)
    return true
  }

  removeAndRelink(repoRoot, config.dir, file, expectedTarget)
  const reason = isBroken
    ? 'broken'
    : isOutsideAgent
      ? 'outside .agent/'
      : `wrong target (was ${target})`
  console.log(`  🔧 ${file}: fixed ${reason} symlink → ${expectedTarget}`)
  return true
}

export function createMissingSymlinks(
  repoRoot: string,
  config: ConsumerConfig,
  existingFiles: Set<string>,
  agentSources: Map<string, string>,
): number {
  let count = 0
  for (const [agentFile, agentPath] of agentSources) {
    if (ALLOWED_REAL_FILES.has(agentFile) || existingFiles.has(agentFile)) continue
    createSymlink(repoRoot, config.dir, agentFile, `${config.sourcePrefix}${agentPath}`)
    count++
  }
  return count
}

export function syncConsumer(
  repoRoot: string,
  config: ConsumerConfig,
  agentSources: Map<string, string>,
): number {
  const fullDir = join(repoRoot, config.dir)
  mkdirSync(fullDir, { recursive: true })

  const files = readdirSync(fullDir)
  console.log(`\n📁 ${config.dir}`)

  let fixCount = 0
  for (const file of files) {
    if (!file.endsWith('.md') || ALLOWED_REAL_FILES.has(file)) continue
    if (fixExistingFile(repoRoot, config, file, agentSources)) fixCount++
  }

  const consumerFiles = new Set(files.filter((f) => f.endsWith('.md')))
  fixCount += createMissingSymlinks(repoRoot, config, consumerFiles, agentSources)

  if (fixCount === 0) console.log('  ✅ All symlinks correct')
  return fixCount
}

// === Gemini CLI TOML Generation ===
// Gemini CLI uses .gemini/commands/*.toml (not markdown symlinks)
// We generate TOML from .agent/commands/ and .agent/workflows/ sources

export function syncGeminiCommands(repoRoot: string): number {
  const geminiDir = join(repoRoot, '.gemini/commands')
  mkdirSync(geminiDir, { recursive: true })

  console.log('\n📁 .gemini/commands (TOML generation)')

  // Collect sources: workflows first (lower priority), then commands override
  const sources = new Map<string, { description: string; body: string; source: string }>()

  const workflowsDir = join(repoRoot, '.agent/workflows')
  if (existsSync(workflowsDir)) {
    for (const workflowFile of readdirSync(workflowsDir).filter((fileName) =>
      fileName.endsWith('.md'),
    )) {
      const name = workflowFile.replace('.md', '')
      const content = readFileSync(join(workflowsDir, workflowFile), 'utf8')
      const { description, body } = parseMarkdownFrontmatter(content)
      sources.set(name, { description, body, source: 'workflows' })
    }
  }

  const commandsDir = join(repoRoot, '.agent/commands')
  if (existsSync(commandsDir)) {
    for (const commandFile of readdirSync(commandsDir).filter((fileName) =>
      fileName.endsWith('.md'),
    )) {
      const name = commandFile.replace('.md', '')
      const content = readFileSync(join(commandsDir, commandFile), 'utf8')
      const { description, body } = parseMarkdownFrontmatter(content)
      sources.set(name, { description, body, source: 'commands' })
    }
  }

  let fixCount = 0
  const existingToml = new Set(readdirSync(geminiDir).filter((f) => f.endsWith('.toml')))

  for (const [name, src] of sources) {
    const tomlFile = `${name}.toml`
    const tomlPath = join(geminiDir, tomlFile)

    // Convert $ARGUMENTS → {{args}} for Gemini's argument substitution
    const prompt = src.body.replace(/\$ARGUMENTS/g, '{{args}}')
    const tomlContent = toToml(src.description, prompt)

    let needsWrite = true
    if (existsSync(tomlPath)) {
      const existing = readFileSync(tomlPath, 'utf8')
      if (existing === tomlContent) {
        needsWrite = false
      }
    }

    if (needsWrite) {
      writeFileSync(tomlPath, tomlContent)
      console.log(`  ✅ ${tomlFile} (from .agent/${src.source}/${name}.md)`)
      fixCount++
    }

    existingToml.delete(tomlFile)
  }

  // Remove stale TOML files that no longer have a source
  for (const stale of existingToml) {
    unlinkSync(join(geminiDir, stale))
    console.log(`  🗑️  ${stale}: removed (no source)`)
    fixCount++
  }

  if (fixCount === 0) console.log('  ✅ All TOML files up to date')
  return fixCount
}

export function syncAll(repoRoot: string, consumers: ConsumerConfig[] = DEFAULT_CONSUMERS): number {
  console.log('🔗 Syncing agent command/workflow symlinks...')

  const agentSources = getAgentSources(repoRoot)
  console.log(`   Found ${agentSources.size} source files in .agent/`)

  let totalFixes = 0
  for (const consumer of consumers) {
    totalFixes += syncConsumer(repoRoot, consumer, agentSources)
  }

  totalFixes += syncSkills(repoRoot, DEFAULT_SKILLS_CONSUMERS)
  totalFixes += syncGeminiCommands(repoRoot)

  console.log()
  if (totalFixes > 0) {
    console.log(`🔧 Fixed ${totalFixes} symlinks`)
  } else {
    console.log('✅ All agent command/workflow/skill symlinks are properly configured')
  }
  return totalFixes
}

// CLI entrypoint — executes when the module is run directly.
// `import.meta.main` is Bun-specific; fall back to a `process.argv[1]` URL
// comparison for Node compatibility. `@types/bun` makes `main` a typed
// property on `ImportMeta`, so we can read it directly under either runtime.
const isMain =
  (typeof import.meta.main === 'boolean' && import.meta.main) ||
  (typeof process !== 'undefined' &&
    process.argv[1] !== undefined &&
    import.meta.url === `file://${process.argv[1]}`)

if (isMain) {
  const repoRoot = findRepoRoot()
  syncAll(repoRoot)
}
