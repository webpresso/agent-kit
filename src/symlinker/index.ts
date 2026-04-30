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
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import { findRepoRoot } from '#utils/repo-root'

import {
  ALLOWED_REAL_FILES,
  type ConsumerConfig,
  DEFAULT_CONSUMERS,
  DEFAULT_PER_SKILL_CONSUMERS,
  DEFAULT_SKILLS_CONSUMERS,
  type PerSkillConsumerConfig,
  type SkillsConsumerConfig,
} from './consumers.js'
import { parseMarkdownFrontmatter } from './frontmatter.js'
import { toToml } from './toml.js'

export {
  ALLOWED_REAL_FILES,
  type ConsumerConfig,
  DEFAULT_CONSUMERS,
  DEFAULT_PER_SKILL_CONSUMERS,
  DEFAULT_SKILLS_CONSUMERS,
  type PerSkillConsumerConfig,
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

  // Per-skill consumer directories (e.g. .agents/skills/<skill>/...)
  for (const { dir } of DEFAULT_PER_SKILL_CONSUMERS) {
    if (file.startsWith(`${dir}/`)) return true
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

export function syncPerSkillConsumer(
  repoRoot: string,
  config: PerSkillConsumerConfig,
): number {
  const skillsSource = join(repoRoot, '.agent/skills')
  if (!existsSync(skillsSource)) return 0

  const consumerDir = join(repoRoot, config.dir)
  mkdirSync(consumerDir, { recursive: true })

  console.log(`\n📁 ${config.dir} (per-skill, file symlinks)`)

  const agentSkills = readdirSync(skillsSource).filter((name) => {
    try {
      return lstatSync(join(skillsSource, name)).isDirectory()
    } catch {
      return false
    }
  })

  let fixCount = 0

  for (const skill of agentSkills) {
    const skillLinkDir = join(consumerDir, skill)

    // Resolve the source directory for this skill. When sourceRootDir is
    // configured, symlink targets resolve through that directory so they
    // trace back to the installed node_modules copy rather than a locally
    // copied .agent/skills/ mirror.
    const srcBaseDir = config.sourceRootDir
      ? join(repoRoot, config.sourceRootDir, skill)
      : join(skillsSource, skill)

    // Handle existing entry at the skill path — replace old directory-symlinks
    // with real directories.
    let dirFixed = false
    const stats = (() => {
      try {
        return lstatSync(skillLinkDir)
      } catch {
        return null
      }
    })()

    if (stats) {
      if (stats.isSymbolicLink()) {
        unlinkSync(skillLinkDir)
        mkdirSync(skillLinkDir, { recursive: true })
        dirFixed = true
      } else if (!stats.isDirectory()) {
        continue
      }
    } else {
      mkdirSync(skillLinkDir, { recursive: true })
    }

    // Read source files to discover what to symlink. When the configured
    // sourceRootDir does not exist (test environments), fall back to listing
    // from .agent/skills/ so we still produce the correct structure.
    const readSourceDir = existsSync(srcBaseDir)
      ? srcBaseDir
      : join(skillsSource, skill)
    const sourceEntries = (() => {
      try {
        return readdirSync(readSourceDir)
      } catch {
        return [] as string[]
      }
    })()
    const sourceFiles = sourceEntries.filter((f) => {
      try {
        return lstatSync(join(readSourceDir, f)).isFile()
      } catch {
        return false
      }
    })

    // Create / validate file symlinks inside the real directory.
    for (const fileName of sourceFiles) {
      const sourcePath = join(srcBaseDir, fileName)
      const linkPath = join(skillLinkDir, fileName)

      const linkStats = (() => {
        try {
          return lstatSync(linkPath)
        } catch {
          return null
        }
      })()

      if (linkStats) {
        if (linkStats.isSymbolicLink()) {
          const target = readlinkSync(linkPath)
          const resolvedTarget = resolve(skillLinkDir, target)
          const resolvedExpected = resolve(sourcePath)
          if (resolvedTarget === resolvedExpected) continue
          unlinkSync(linkPath)
        } else {
          // Real file — user-owned, skip
          continue
        }
      }

      const relativeTarget = relative(skillLinkDir, sourcePath)
      createSymlinkWithType(
        relativeTarget,
        linkPath,
        'file',
        `${config.dir}/${skill}/${fileName}`,
      )
      console.log(`  ✅ ${skill}/${fileName} → ${relativeTarget}`)
      fixCount++
    }

    // Clean up stale file symlinks that have no source counterpart.
    const existingSourceFiles = new Set(sourceFiles)
    for (const entry of readdirSync(skillLinkDir)) {
      if (existingSourceFiles.has(entry)) continue
      const entryPath = join(skillLinkDir, entry)
      const entryStats = (() => {
        try {
          return lstatSync(entryPath)
        } catch {
          return null
        }
      })()
      if (!entryStats || !entryStats.isSymbolicLink()) continue
      unlinkSync(entryPath)
      console.log(`  🗑️  ${skill}/${entry}: removed stale file symlink`)
      fixCount++
    }

    if (dirFixed) fixCount++
  }

  // Remove stale entries in the consumer directory that no longer map to a
  // skill under .agent/skills/.  Handles both old-style directory symlinks
  // and new-style real directories (only when the directory is empty — a
  // non-empty real directory is assumed to be user-owned).
  for (const entry of readdirSync(consumerDir)) {
    if (agentSkills.includes(entry)) continue
    const entryPath = join(consumerDir, entry)
    const entryStats = (() => {
      try {
        return lstatSync(entryPath)
      } catch {
        return null
      }
    })()
    if (!entryStats) continue

    if (entryStats.isSymbolicLink()) {
      unlinkSync(entryPath)
      console.log(`  🗑️  ${entry}: removed stale directory symlink (skill gone)`)
      fixCount++
    } else if (entryStats.isDirectory()) {
      let isEmpty = false
      try {
        isEmpty = readdirSync(entryPath).length === 0
      } catch {
        continue
      }
      if (isEmpty) {
        rmSync(entryPath, { recursive: true, force: true })
        console.log(`  🗑️  ${entry}: removed empty stale directory (skill gone)`)
        fixCount++
      }
    }
  }

  if (fixCount === 0) console.log('  ✅ All symlinks correct')
  return fixCount
}

export function syncPerSkillConsumers(
  repoRoot: string,
  consumers: PerSkillConsumerConfig[] = DEFAULT_PER_SKILL_CONSUMERS,
): number {
  const skillsSource = join(repoRoot, '.agent/skills')
  if (!existsSync(skillsSource)) return 0

  let fixCount = 0
  for (const consumer of consumers) {
    fixCount += syncPerSkillConsumer(repoRoot, consumer)
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

/**
 * Sync repo-root AGENTS.md from canonical .agent/AGENTS.md.
 * Returns 1 if a write occurred, 0 if already up to date.
 */
export function syncAgentsMd(repoRoot: string): number {
  const source = join(repoRoot, '.agent', 'AGENTS.md')
  if (!existsSync(source)) return 0

  const dest = join(repoRoot, 'AGENTS.md')
  const content = readFileSync(source, 'utf8')

  if (existsSync(dest)) {
    const existing = readFileSync(dest, 'utf8')
    if (existing === content) {
      console.log('\n📄 AGENTS.md — up to date')
      return 0
    }
  }

  writeFileSync(dest, content)
  console.log('\n📄 AGENTS.md — written from .agent/AGENTS.md')
  return 1
}

/**
 * Fan out .agent/mcp.json to canonical MCP consumer paths:
 *   .mcp.json, .cursor/mcp.json
 * Returns the number of files written/updated.
 */
export function syncMcpJson(repoRoot: string): number {
  const source = join(repoRoot, '.agent', 'mcp.json')
  if (!existsSync(source)) return 0

  const content = readFileSync(source, 'utf8')
  const targets = [join(repoRoot, '.mcp.json'), join(repoRoot, '.cursor', 'mcp.json')]

  let writeCount = 0
  console.log('\n🔌 MCP server registration fan-out')
  for (const dest of targets) {
    mkdirSync(dirname(dest), { recursive: true })
    if (existsSync(dest)) {
      const existing = readFileSync(dest, 'utf8')
      if (existing === content) {
        const rel = relative(repoRoot, dest)
        console.log(`  ✅ ${rel} — up to date`)
        continue
      }
    }
    writeFileSync(dest, content)
    const rel = relative(repoRoot, dest)
    console.log(`  ✅ ${rel} — written from .agent/mcp.json`)
    writeCount++
  }
  return writeCount
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
  totalFixes += syncPerSkillConsumers(repoRoot, DEFAULT_PER_SKILL_CONSUMERS)
  totalFixes += syncGeminiCommands(repoRoot)
  totalFixes += syncAgentsMd(repoRoot)
  totalFixes += syncMcpJson(repoRoot)

  console.log()
  if (totalFixes > 0) {
    console.log(`🔧 Fixed ${totalFixes} symlinks`)
  } else {
    console.log('✅ All agent command/workflow/skill symlinks are properly configured')
  }
  return totalFixes
}

/**
 * Import an existing IDE rule file into the canonical .agent/ directory.
 *
 * Supported sources: .cursorrules, CLAUDE.md, .github/copilot-instructions.md
 *
 * The source file is copied to .agent/AGENTS.md (if it does not already
 * exist), leaving the original in place so that a subsequent `ak symlink sync`
 * can fan it back out.  Returns the destination path on success, or null when
 * the source file does not exist.
 */
export function importAgentFile(
  repoRoot: string,
  fromPath: string,
): { source: string; dest: string } | null {
  const KNOWN_SOURCES: Readonly<Record<string, string>> = {
    '.cursorrules': 'AGENTS.md',
    'CLAUDE.md': 'AGENTS.md',
    '.github/copilot-instructions.md': 'AGENTS.md',
  }

  // Normalise: strip leading ./ for map lookup
  const normalised = fromPath.replace(/^\.\//, '')
  const destName = KNOWN_SOURCES[normalised]
  if (destName === undefined) {
    return null
  }

  const sourcePath = join(repoRoot, normalised)
  if (!existsSync(sourcePath)) {
    return null
  }

  const agentDir = join(repoRoot, '.agent')
  mkdirSync(agentDir, { recursive: true })

  const destPath = join(agentDir, destName)
  const content = readFileSync(sourcePath, 'utf8')
  writeFileSync(destPath, content)

  return { source: normalised, dest: `.agent/${destName}` }
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
