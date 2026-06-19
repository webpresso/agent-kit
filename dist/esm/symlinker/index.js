#!/usr/bin/env node
/**
 * Audit & Auto-Fix: Agent Command/Workflow Symlinks
 *
 * Ensures all consumer directories (e.g. .claude/commands) use symlinks
 * pointing to `.agent/` source files and keeps skill directories as single
 * directory-symlinks.
 *
 * Auto-fixes:
 * - Replaces real files with symlinks to .agent/ source
 * - Removes broken symlinks and recreates them
 * - Removes stale mirrored files when the .agent/ source no longer exists
 * - Creates missing symlinks for all .agent/ entries
 * - Removes symlinks pointing outside .agent/
 *
 * Usage:
 *   wp symlink sync            # Phase 2 — wires to syncAll
 *   node dist/symlinker/index  # direct invocation from built output
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync, } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { ALLOWED_REAL_FILES, DEFAULT_CONSUMERS, DEFAULT_PER_SKILL_CONSUMERS, DEFAULT_SKILLS_CONSUMERS, } from './consumers.js';
import { isSymlinkPointingTo } from './unified-sync.js';
export { ALLOWED_REAL_FILES, DEFAULT_CONSUMERS, DEFAULT_PER_SKILL_CONSUMERS, DEFAULT_SKILLS_CONSUMERS, };
export function isAgentOrConsumerFile(file) {
    if (!file.endsWith('.md'))
        return false;
    // .agent/ source markdown (commands, workflows, skills)
    if (/^\.agent\/(commands|workflows|skills)\/.+\.md$/.test(file))
        return true;
    // Mirrored consumer command/workflow directories
    for (const { dir } of DEFAULT_CONSUMERS) {
        if (file.startsWith(`${dir}/`))
            return true;
    }
    // Mirrored consumer skill directories (nested under skill subdirs)
    for (const { linkPath } of DEFAULT_SKILLS_CONSUMERS) {
        if (file.startsWith(`${linkPath}/`))
            return true;
    }
    // Per-skill consumer directories (e.g. .agents/skills/<skill>/...)
    for (const { dir } of DEFAULT_PER_SKILL_CONSUMERS) {
        if (file.startsWith(`${dir}/`))
            return true;
    }
    return false;
}
export function getAgentSources(repoRoot) {
    const sources = new Map();
    const commandsDir = join(repoRoot, '.agent/commands');
    if (existsSync(commandsDir)) {
        for (const commandFile of readdirSync(commandsDir).filter((fileName) => fileName.endsWith('.md'))) {
            sources.set(commandFile, `commands/${commandFile}`);
        }
    }
    const workflowsDir = join(repoRoot, '.agent/workflows');
    if (existsSync(workflowsDir)) {
        for (const workflowFile of readdirSync(workflowsDir).filter((fileName) => fileName.endsWith('.md'))) {
            sources.set(workflowFile, `workflows/${workflowFile}`);
        }
    }
    return sources;
}
export function syncSkillsConsumer(repoRoot, config) {
    const fullPath = join(repoRoot, config.linkPath);
    const parentDir = join(fullPath, '..');
    mkdirSync(parentDir, { recursive: true });
    console.log(`\n📁 ${config.linkPath}`);
    const stats = (() => {
        try {
            return lstatSync(fullPath);
        }
        catch {
            return null;
        }
    })();
    if (stats) {
        if (stats.isSymbolicLink()) {
            const target = readlinkSync(fullPath);
            const resolvedTarget = resolve(parentDir, target);
            const isBroken = !existsSync(resolvedTarget);
            const isCorrect = target.replace(/\\/g, '/') === config.target;
            if (!isBroken && isCorrect) {
                console.log('  ✅ Symlink correct');
                return 0;
            }
            unlinkSync(fullPath);
            const reason = isBroken ? 'broken' : `wrong target (${target})`;
            console.log(`  🔧 Removed ${reason} symlink`);
        }
        else {
            console.log(`  ⚠️  ${config.linkPath}: is a real directory — skipped (remove manually)`);
            return 0;
        }
    }
    createSymlinkWithType(config.target, fullPath, 'dir', config.linkPath);
    console.log(`  ✅ ${config.linkPath} → ${config.target}`);
    return 1;
}
export function syncSkills(repoRoot, consumers = DEFAULT_SKILLS_CONSUMERS) {
    const skillsSource = join(repoRoot, '.agent/skills');
    if (!existsSync(skillsSource))
        return 0;
    let fixCount = 0;
    for (const consumer of consumers) {
        fixCount += syncSkillsConsumer(repoRoot, consumer);
    }
    return fixCount;
}
/**
 * Directory-level skill projection from `.agent/skills/<slug>/` into a
 * per-IDE consumer dir (e.g. `.agents/skills/<slug>`). Codex documents support
 * for symlinked skill folders; file-level `SKILL.md` symlinks inside real
 * folders are not a documented discovery shape and can be skipped by hosts.
 *
 * Source-of-truth: `.agent/skills/<slug>/` (the consumer projection
 * produced by `runUnifiedSync` + scaffolders). NOT `node_modules/.../skills/`
 * (the legacy `sourceRootDir` semantic was dropped — the bug class was
 * an asymmetric fallback where listing succeeded against `.agent/skills/`
 * but symlink targets pointed at the missing `node_modules/.../skills/`).
 *
 * Contract: `.agents/skills/<slug>` is an webpresso-owned generated symlink.
 * Top-level entries that do not correspond to a skill in `.agent/skills/` are
 * removed recursively. Real directories for expected slugs are also replaced
 * so stale file-level projections cannot mask the official directory-symlink
 * discovery surface.
 *
 * Throws (synchronously) on any file-op error so callers see fail-loud
 * exit codes instead of `console.log('✅')` followed by broken state.
 */
export function syncSkillFanout(repoRoot, config) {
    const skillsSource = join(repoRoot, '.agent/skills');
    if (!existsSync(skillsSource))
        return { wrote: 0 };
    const consumerDir = join(repoRoot, config.dir);
    mkdirSync(consumerDir, { recursive: true });
    console.log(`\n📁 ${config.dir} (per-skill, directory symlinks)`);
    const agentSkills = readdirSync(skillsSource).filter((name) => {
        try {
            // `.agent/skills/<slug>` may be a symlink (catalog projection via
            // unified-sync). statSync follows symlinks, lstatSync would not.
            return statSync(join(skillsSource, name)).isDirectory();
        }
        catch {
            return false;
        }
    });
    let wrote = 0;
    for (const skill of agentSkills) {
        const skillLinkDir = join(consumerDir, skill);
        const srcDir = join(skillsSource, skill);
        const expectedAbs = resolve(srcDir);
        const stats = lstatNullable(skillLinkDir);
        if (stats && stats.isSymbolicLink() && isSymlinkPointingTo(skillLinkDir, expectedAbs)) {
            continue;
        }
        if (stats) {
            rmSync(skillLinkDir, { recursive: true, force: true });
            wrote++;
        }
        const relativeTarget = relative(consumerDir, srcDir);
        createSymlinkWithType(relativeTarget, skillLinkDir, 'dir', `${config.dir}/${skill}`);
        console.log(`  ✅ ${skill}/ → ${relativeTarget}`);
        wrote++;
    }
    // Top-level prune: remove any consumer-dir entry that doesn't correspond
    // to a current skill. Aggressive: real non-empty dirs are removed
    // recursively (per the documented `.agents/skills/` ownership contract).
    // Stderr line per removal so the destructive action is never silent.
    const expectedSlugs = new Set(agentSkills);
    for (const entry of readdirSync(consumerDir)) {
        if (expectedSlugs.has(entry))
            continue;
        const entryPath = join(consumerDir, entry);
        const entryStats = lstatNullable(entryPath);
        if (!entryStats)
            continue;
        if (entryStats.isSymbolicLink()) {
            unlinkSync(entryPath);
            console.error(`Removed unexpected directory: ${config.dir}/${entry}`);
            wrote++;
        }
        else if (entryStats.isDirectory()) {
            rmSync(entryPath, { recursive: true, force: true });
            console.error(`Removed unexpected directory: ${config.dir}/${entry}`);
            wrote++;
        }
    }
    if (wrote === 0)
        console.log('  ✅ All symlinks correct');
    return { wrote };
}
export function syncSkillFanouts(repoRoot, consumers = DEFAULT_PER_SKILL_CONSUMERS) {
    const skillsSource = join(repoRoot, '.agent/skills');
    if (!existsSync(skillsSource))
        return { wrote: 0 };
    let wrote = 0;
    for (const consumer of consumers) {
        wrote += syncSkillFanout(repoRoot, consumer).wrote;
    }
    return { wrote };
}
function lstatNullable(path) {
    try {
        return lstatSync(path);
    }
    catch {
        return null;
    }
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
function createSymlinkWithType(target, linkPath, type, label) {
    try {
        symlinkSync(target, linkPath, type);
    }
    catch (error) {
        const code = error.code;
        if (process.platform === 'win32' && code === 'EPERM') {
            throw new Error(`Cannot create symlink ${label} → ${target}: Windows denied permission. ` +
                'Enable Developer Mode (Settings → Privacy & security → For developers) ' +
                'or run this script from an elevated shell.', { cause: error });
        }
        throw error;
    }
}
export function createSymlink(repoRoot, consumerDir, file, symlinkTarget) {
    const fullPath = join(repoRoot, consumerDir, file);
    createSymlinkWithType(symlinkTarget, fullPath, 'file', `${consumerDir}/${file}`);
    console.log(`  ✅ ${file} → ${symlinkTarget}`);
}
function removeAndRelink(repoRoot, consumerDir, file, symlinkTarget) {
    const fullPath = join(repoRoot, consumerDir, file);
    unlinkSync(fullPath);
    createSymlinkWithType(symlinkTarget, fullPath, 'file', `${consumerDir}/${file}`);
}
export function fixExistingFile(repoRoot, config, file, agentSources) {
    const fullPath = join(repoRoot, config.dir, file);
    const stats = lstatSync(fullPath);
    const agentPath = agentSources.get(file);
    const expectedTarget = agentPath ? `${config.sourcePrefix}${agentPath}` : null;
    if (!stats.isSymbolicLink()) {
        if (!expectedTarget) {
            console.log(`  ⚠️  ${file}: real file with no .agent/ source — skipped (move manually)`);
            return false;
        }
        removeAndRelink(repoRoot, config.dir, file, expectedTarget);
        console.log(`  🔧 ${file}: replaced real file → ${expectedTarget}`);
        return true;
    }
    const target = readlinkSync(fullPath);
    const normalizedTarget = target.replace(/\\/g, '/');
    const resolvedTarget = resolve(join(repoRoot, config.dir), target);
    const isBroken = !existsSync(resolvedTarget);
    const isOutsideAgent = !normalizedTarget.includes('.agent/');
    const isWrongTarget = expectedTarget !== null && normalizedTarget !== expectedTarget;
    if (!isBroken && !isOutsideAgent && !isWrongTarget)
        return false;
    if (!expectedTarget) {
        unlinkSync(fullPath);
        console.log(`  🗑️  ${file}: removed broken symlink (no .agent/ source)`);
        return true;
    }
    removeAndRelink(repoRoot, config.dir, file, expectedTarget);
    const reason = isBroken
        ? 'broken'
        : isOutsideAgent
            ? 'outside .agent/'
            : `wrong target (was ${target})`;
    console.log(`  🔧 ${file}: fixed ${reason} symlink → ${expectedTarget}`);
    return true;
}
export function createMissingSymlinks(repoRoot, config, existingFiles, agentSources) {
    let count = 0;
    for (const [agentFile, agentPath] of agentSources) {
        if (ALLOWED_REAL_FILES.has(agentFile) || existingFiles.has(agentFile))
            continue;
        createSymlink(repoRoot, config.dir, agentFile, `${config.sourcePrefix}${agentPath}`);
        count++;
    }
    return count;
}
export function syncConsumer(repoRoot, config, agentSources) {
    const fullDir = join(repoRoot, config.dir);
    mkdirSync(fullDir, { recursive: true });
    const files = readdirSync(fullDir);
    console.log(`\n📁 ${config.dir}`);
    let fixCount = 0;
    for (const file of files) {
        if (!file.endsWith('.md') || ALLOWED_REAL_FILES.has(file))
            continue;
        if (fixExistingFile(repoRoot, config, file, agentSources))
            fixCount++;
    }
    const consumerFiles = new Set(files.filter((f) => f.endsWith('.md')));
    fixCount += createMissingSymlinks(repoRoot, config, consumerFiles, agentSources);
    if (fixCount === 0)
        console.log('  ✅ All symlinks correct');
    return fixCount;
}
/**
 * Sync repo-root AGENTS.md from canonical .agent/AGENTS.md.
 * Returns 1 if a write occurred, 0 if already up to date.
 */
export function syncAgentsMd(repoRoot) {
    const source = join(repoRoot, '.agent', 'AGENTS.md');
    if (!existsSync(source))
        return 0;
    const dest = join(repoRoot, 'AGENTS.md');
    const content = readFileSync(source, 'utf8');
    if (existsSync(dest)) {
        const existing = readFileSync(dest, 'utf8');
        if (existing === content) {
            console.log('\n📄 AGENTS.md — up to date');
            return 0;
        }
    }
    writeFileSync(dest, content);
    console.log('\n📄 AGENTS.md — written from .agent/AGENTS.md');
    return 1;
}
/**
 * Fan out .agent/mcp.json to canonical MCP consumer paths:
 *   .mcp.json, .cursor/mcp.json
 * Returns the number of files written/updated.
 */
export function syncMcpJson(repoRoot) {
    const source = join(repoRoot, '.agent', 'mcp.json');
    if (!existsSync(source))
        return 0;
    const content = readFileSync(source, 'utf8');
    const targets = [join(repoRoot, '.mcp.json'), join(repoRoot, '.cursor', 'mcp.json')];
    let writeCount = 0;
    console.log('\n🔌 MCP server registration fan-out');
    for (const dest of targets) {
        mkdirSync(dirname(dest), { recursive: true });
        if (existsSync(dest)) {
            const existing = readFileSync(dest, 'utf8');
            if (existing === content) {
                const rel = relative(repoRoot, dest);
                console.log(`  ✅ ${rel} — up to date`);
                continue;
            }
        }
        writeFileSync(dest, content);
        const rel = relative(repoRoot, dest);
        console.log(`  ✅ ${rel} — written from .agent/mcp.json`);
        writeCount++;
    }
    return writeCount;
}
export function syncAll(repoRoot, consumers = DEFAULT_CONSUMERS) {
    console.log('🔗 Syncing agent command/workflow symlinks...');
    const agentSources = getAgentSources(repoRoot);
    console.log(`   Found ${agentSources.size} source files in .agent/`);
    let totalFixes = 0;
    for (const consumer of consumers) {
        totalFixes += syncConsumer(repoRoot, consumer, agentSources);
    }
    totalFixes += syncSkills(repoRoot, DEFAULT_SKILLS_CONSUMERS);
    totalFixes += syncSkillFanouts(repoRoot, DEFAULT_PER_SKILL_CONSUMERS).wrote;
    // Fan-out writes are tracked separately — they are not "broken symlinks",
    // so they must not pollute totalFixes (which gates `wp symlink check`).
    syncAgentsMd(repoRoot);
    syncMcpJson(repoRoot);
    console.log();
    if (totalFixes > 0) {
        console.log(`🔧 Fixed ${totalFixes} symlinks`);
    }
    else {
        console.log('✅ All agent command/workflow/skill symlinks are properly configured');
    }
    return totalFixes;
}
/**
 * Import an existing IDE rule file into the canonical .agent/ directory.
 *
 * Supported sources: .cursorrules, CLAUDE.md, .github/copilot-instructions.md
 *
 * The source file is copied to .agent/AGENTS.md (if it does not already
 * exist), leaving the original in place so that a subsequent `wp symlink sync`
 * can fan it back out.  Returns the destination path on success, or null when
 * the source file does not exist.
 */
export function importAgentFile(repoRoot, fromPath) {
    const KNOWN_SOURCES = {
        '.cursorrules': 'AGENTS.md',
        'CLAUDE.md': 'AGENTS.md',
        '.github/copilot-instructions.md': 'AGENTS.md',
    };
    // Normalise: strip leading ./ for map lookup
    const normalised = fromPath.replace(/^\.\//, '');
    const destName = KNOWN_SOURCES[normalised];
    if (destName === undefined) {
        return null;
    }
    const sourcePath = join(repoRoot, normalised);
    if (!existsSync(sourcePath)) {
        return null;
    }
    const agentDir = join(repoRoot, '.agent');
    mkdirSync(agentDir, { recursive: true });
    const destPath = join(agentDir, destName);
    const content = readFileSync(sourcePath, 'utf8');
    writeFileSync(destPath, content);
    return { source: normalised, dest: `.agent/${destName}` };
}
// CLI entrypoint — executes when the module is run directly.
// `import.meta.main` is Bun-specific; fall back to a `process.argv[1]` URL
// comparison for Node compatibility. `@types/bun` makes `main` a typed
// property on `ImportMeta`, so we can read it directly under either runtime.
const isMain = (typeof import.meta.main === 'boolean' && import.meta.main) ||
    (typeof process !== 'undefined' &&
        process.argv[1] !== undefined &&
        import.meta.url === `file://${process.argv[1]}`);
if (isMain) {
    syncAll(process.cwd());
}
//# sourceMappingURL=index.js.map