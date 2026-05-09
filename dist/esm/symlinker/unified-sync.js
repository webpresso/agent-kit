/**
 * Unified rule + skill sync.
 *
 * Source of truth: catalog (`<pkg>/dist/catalog/agent/{rules,skills}/`) UNION
 * consumer (`<repo>/agent-{rules,skills}/`). The loader returns a
 * source-tagged record list; this module projects that list into per-IDE
 * surfaces according to `DEFAULT_UNIFIED_CONSUMERS`.
 *
 * Per-consumer strategy:
 *   - 'symlink':   relative symlink (file for rules, dir for skills).
 *   - 'copy':      atomic copy (file for rules, recursive copy for skills).
 *   - 'transform': apply the consumer's transform function to the record body
 *                  and atomic-write the result at the target path.
 *
 * Prune: any file/dir under a consumer's dir whose name matches the unified
 * filename pattern but is not in the expected set is removed. This propagates
 * deletions in `agent-rules/` and `agent-skills/` to per-IDE cleanup.
 *
 * `--check` mode (dry-run): produce a list of (target, status) pairs and
 * return the count of mismatches; perform no writes.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync, } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { loadContent } from '#content/loader';
import { DEFAULT_UNIFIED_CONSUMERS, unifiedRuleFilename, } from './consumers.js';
/**
 * Create a symlink with explicit Windows type hint. POSIX ignores the type;
 * Windows requires it for directory symlinks. Wraps EPERM with a helpful
 * Developer-Mode pointer.
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
function atomicWriteFile(filePath, content) {
    mkdirSync(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmp, content);
    renameSync(tmp, filePath);
}
function safeRemove(path) {
    try {
        const st = lstatSync(path);
        if (st.isSymbolicLink() || st.isFile()) {
            unlinkSync(path);
        }
        else {
            rmSync(path, { recursive: true, force: true });
        }
    }
    catch {
        // already gone
    }
}
export function isSymlinkPointingTo(linkPath, expectedAbs) {
    try {
        const st = lstatSync(linkPath);
        if (!st.isSymbolicLink())
            return false;
        const target = readlinkSync(linkPath);
        const resolved = resolve(dirname(linkPath), target);
        return resolved === expectedAbs;
    }
    catch {
        return false;
    }
}
function planTargets(records, consumers, consumerRoot) {
    const out = [];
    for (const consumer of consumers) {
        for (const record of records) {
            if (record.kind !== consumer.acceptsKind)
                continue;
            const consumerDirAbs = join(consumerRoot, consumer.dir);
            let entryName;
            let targetPath;
            if (record.kind === 'rule') {
                entryName = unifiedRuleFilename(consumer, record.slug);
                targetPath = join(consumerDirAbs, entryName);
            }
            else {
                // skills: dir-shaped
                entryName = record.slug;
                targetPath = join(consumerDirAbs, entryName);
            }
            out.push({ consumer, record, targetPath, entryName });
        }
    }
    return out;
}
/**
 * Recursively copy a directory tree using only fs primitives.
 * Mirrors files; subdirectories are created on-demand. Files are atomic-written.
 */
function copyDirRecursive(srcDir, destDir) {
    let writes = 0;
    mkdirSync(destDir, { recursive: true });
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
        const srcPath = join(srcDir, entry.name);
        const destPath = join(destDir, entry.name);
        if (entry.isDirectory()) {
            writes += copyDirRecursive(srcPath, destPath);
        }
        else if (entry.isFile()) {
            const srcContent = readFileSync(srcPath);
            let needsWrite = true;
            if (existsSync(destPath)) {
                try {
                    const existing = readFileSync(destPath);
                    if (existing.equals(srcContent))
                        needsWrite = false;
                }
                catch {
                    // fall through to write
                }
            }
            if (needsWrite) {
                atomicWriteFile(destPath, srcContent);
                writes++;
            }
        }
    }
    return writes;
}
function dirsEqual(srcDir, destDir) {
    if (!existsSync(destDir))
        return false;
    const srcEntries = readdirSync(srcDir, { withFileTypes: true })
        .map((e) => e.name)
        .toSorted();
    const destEntries = readdirSync(destDir, { withFileTypes: true })
        .map((e) => e.name)
        .toSorted();
    if (srcEntries.length !== destEntries.length)
        return false;
    for (let i = 0; i < srcEntries.length; i++) {
        if (srcEntries[i] !== destEntries[i])
            return false;
        const srcSub = join(srcDir, srcEntries[i]);
        const destSub = join(destDir, srcEntries[i]);
        const srcStat = lstatSync(srcSub);
        if (srcStat.isDirectory()) {
            if (!dirsEqual(srcSub, destSub))
                return false;
        }
        else if (srcStat.isFile()) {
            const srcContent = readFileSync(srcSub);
            const destContent = readFileSync(destSub);
            if (!srcContent.equals(destContent))
                return false;
        }
    }
    return true;
}
/**
 * Apply a single planned target. Returns 1 on write, 0 if already correct.
 */
function applyTarget(plan, check) {
    const { consumer, record, targetPath } = plan;
    const sourcePath = record.kind === 'skill' ? dirname(record.filePath) : record.filePath;
    switch (consumer.strategy) {
        case 'symlink': {
            // Use the resolved (real) source path so links survive pnpm version churn.
            if (isSymlinkPointingTo(targetPath, sourcePath))
                return { wrote: 0 };
            if (check)
                return { wrote: 1, mismatch: 'symlink missing or pointing elsewhere' };
            mkdirSync(dirname(targetPath), { recursive: true });
            safeRemove(targetPath);
            const rel = relative(dirname(targetPath), sourcePath);
            const symType = record.kind === 'skill' ? 'dir' : 'file';
            createSymlinkWithType(rel, targetPath, symType, `${consumer.dir}/${plan.entryName}`);
            return { wrote: 1 };
        }
        case 'copy': {
            if (record.kind === 'skill') {
                // Compare dir contents; copy if differs.
                if (dirsEqual(sourcePath, targetPath))
                    return { wrote: 0 };
                if (check)
                    return { wrote: 1, mismatch: 'copied skill dir differs from source' };
                // Replace existing target if it's a symlink/file; clean recursively if dir.
                if (existsSync(targetPath)) {
                    const st = lstatSync(targetPath);
                    if (st.isSymbolicLink() || st.isFile())
                        unlinkSync(targetPath);
                }
                mkdirSync(targetPath, { recursive: true });
                copyDirRecursive(sourcePath, targetPath);
                return { wrote: 1 };
            }
            // rule: single file copy with content compare.
            const sourceBytes = readFileSync(sourcePath);
            let same = false;
            if (existsSync(targetPath)) {
                try {
                    const existing = readFileSync(targetPath);
                    same = existing.equals(sourceBytes);
                }
                catch {
                    same = false;
                }
            }
            if (same)
                return { wrote: 0 };
            if (check)
                return { wrote: 1, mismatch: 'copied rule differs from source' };
            atomicWriteFile(targetPath, sourceBytes);
            return { wrote: 1 };
        }
        case 'transform': {
            const transform = consumer.transform;
            if (!transform) {
                throw new Error(`Unified consumer '${consumer.id}' uses strategy 'transform' but no transform fn was provided.`);
            }
            const expected = transform({ record, targetPath });
            let same = false;
            if (existsSync(targetPath)) {
                try {
                    same = readFileSync(targetPath, 'utf8') === expected;
                }
                catch {
                    same = false;
                }
            }
            if (same)
                return { wrote: 0 };
            if (check)
                return { wrote: 1, mismatch: 'transformed output differs from source' };
            atomicWriteFile(targetPath, expected);
            return { wrote: 1 };
        }
    }
}
/**
 * Remove entries under each consumer dir that no longer correspond to any
 * planned record. Only removes entries whose shape matches the consumer's
 * managed pattern (rule files: `<slug><ext>`; skill dirs: subdirectories).
 * Real files outside the managed pattern (README.md, .gitkeep) are left alone.
 */
function pruneStale(plans, consumers, consumerRoot, check, preserveSkillSlugs) {
    const expectedByConsumerDir = new Map();
    for (const plan of plans) {
        const key = plan.consumer.dir;
        let set = expectedByConsumerDir.get(key);
        if (!set) {
            set = new Set();
            expectedByConsumerDir.set(key, set);
        }
        set.add(plan.entryName);
    }
    let removed = 0;
    const mismatches = [];
    // Each unique dir gets a single sweep — multiple consumers can share a dir
    // (e.g. .claude/skills hosts both rules and skills).
    const dirs = new Set(consumers.map((c) => c.dir));
    for (const dir of dirs) {
        const dirAbs = join(consumerRoot, dir);
        if (!existsSync(dirAbs))
            continue;
        const expected = expectedByConsumerDir.get(dir) ?? new Set();
        const consumersForDir = consumers.filter((c) => c.dir === dir);
        const acceptsSkill = consumersForDir.some((c) => c.acceptsKind === 'skill');
        for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
            const name = entry.name;
            if (name === 'README.md' || name === '.gitkeep' || name.startsWith('.'))
                continue;
            if (expected.has(name))
                continue;
            if (acceptsSkill &&
                preserveSkillSlugs !== undefined &&
                preserveSkillSlugs.has(name) &&
                entry.isDirectory())
                continue;
            // Only prune entries that match a managed shape: rule extension OR a
            // directory (skill).
            const matchesRulePattern = consumersForDir.some((c) => c.acceptsKind === 'rule' && name.endsWith(c.ruleExtension ?? '.md'));
            const matchesSkillPattern = consumersForDir.some((c) => c.acceptsKind === 'skill') && entry.isDirectory();
            // Also handle stale symlinks of either shape.
            const isLink = entry.isSymbolicLink();
            if (!matchesRulePattern && !matchesSkillPattern && !isLink)
                continue;
            const fullPath = join(dirAbs, name);
            if (check) {
                mismatches.push({
                    consumerId: consumersForDir[0]?.id ?? dir,
                    targetPath: fullPath,
                    reason: 'stale entry not in unified record set',
                });
                removed++;
                continue;
            }
            safeRemove(fullPath);
            removed++;
        }
    }
    return { removed, mismatches };
}
/**
 * Main entrypoint. See module docstring.
 */
export function runUnifiedSync(options) {
    const consumers = options.consumers ?? DEFAULT_UNIFIED_CONSUMERS;
    const kinds = options.kinds ?? ['rule', 'skill'];
    // Realpath both roots so symlink target paths (computed via `relative()`)
    // stay in a single realm. Without this, on macOS where tmpdir() resolves
    // through /var → /private/var, the relative path between a non-real
    // consumer dir and a real catalog file traverses across the symlink
    // boundary and lands on a non-existent path.
    const consumerRoot = (() => {
        if (existsSync(options.consumerRoot)) {
            mkdirSync(options.consumerRoot, { recursive: true });
            return realpathSync(options.consumerRoot);
        }
        mkdirSync(options.consumerRoot, { recursive: true });
        return realpathSync(options.consumerRoot);
    })();
    const loaded = loadContent({
        catalogDir: options.catalogDir,
        consumerRoot,
        kinds,
    });
    const filteredRecords = options.allowedSkillSlugs
        ? loaded.records.filter((r) => r.kind !== 'skill' || options.allowedSkillSlugs.has(r.slug))
        : loaded.records;
    if (loaded.collisions.length > 0) {
        const lines = loaded.collisions.map((c) => `  - ${c.kind}/${c.slug}: canonical=${c.canonical} consumer=${c.consumer}`);
        throw new Error(`ak sync: slug collisions between catalog and consumer (rename consumer copy):\n${lines.join('\n')}`);
    }
    const plans = planTargets(filteredRecords, consumers, consumerRoot);
    let fixCount = 0;
    const mismatches = [];
    for (const plan of plans) {
        const result = applyTarget(plan, options.check === true);
        if (result.wrote > 0) {
            fixCount += result.wrote;
            if (options.check === true && result.mismatch !== undefined) {
                mismatches.push({
                    consumerId: plan.consumer.id,
                    targetPath: plan.targetPath,
                    reason: result.mismatch,
                });
            }
        }
    }
    const prune = pruneStale(plans, consumers, consumerRoot, options.check === true, options.preserveSkillSlugs);
    fixCount += prune.removed;
    mismatches.push(...prune.mismatches);
    return { fixCount, mismatches };
}
//# sourceMappingURL=unified-sync.js.map