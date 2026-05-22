/**
 * Conflict policy for `wp init` file writes.
 *
 * Default: don't clobber consumer edits. If the target exists and differs
 * from the incoming content, report drift and leave the file untouched. In
 * overwrite mode: replace unconditionally. In dry-run: log the would-be change
 * only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
export function writeFileMerged(targetPath, incoming, opts = {}) {
    const exists = existsSync(targetPath);
    const existingContent = exists ? readFileSync(targetPath, 'utf8') : null;
    if (!exists) {
        if (opts.dryRun)
            return { targetPath, action: 'skipped-dry' };
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, incoming);
        return { targetPath, action: 'created' };
    }
    if (existingContent === incoming) {
        return { targetPath, action: 'identical' };
    }
    if (opts.overwrite) {
        if (opts.dryRun)
            return { targetPath, action: 'skipped-dry' };
        writeFileSync(targetPath, incoming);
        return { targetPath, action: 'overwritten' };
    }
    if (opts.dryRun)
        return { targetPath, action: 'skipped-dry' };
    return { targetPath, action: 'drifted' };
}
/**
 * Copy a single file from the catalog to the consumer, applying merge policy.
 */
export function copyFileMerged(sourcePath, targetPath, opts = {}) {
    const incoming = readFileSync(sourcePath, 'utf8');
    return writeFileMerged(targetPath, incoming, opts);
}
/**
 * Recursively copy a directory. Applies merge policy to every file.
 * Returns one MergeResult per file processed.
 */
export function copyDirectoryMerged(sourceDir, targetDir, opts = {}) {
    const results = [];
    if (!existsSync(sourceDir))
        return results;
    const stack = [{ src: sourceDir, dst: targetDir }];
    while (stack.length > 0) {
        const entry = stack.pop();
        if (!entry)
            break;
        const { src, dst } = entry;
        if (!opts.dryRun)
            mkdirSync(dst, { recursive: true });
        const items = readdirSync(src);
        for (const item of items) {
            const srcFull = join(src, item);
            const dstFull = join(dst, item);
            const st = statSync(srcFull);
            if (st.isDirectory()) {
                stack.push({ src: srcFull, dst: dstFull });
            }
            else if (st.isFile()) {
                results.push(copyFileMerged(srcFull, dstFull, opts));
            }
        }
    }
    return results;
}
/**
 * Read, patch, and write a JSON file. The patcher receives the parsed object
 * (or `{}` if the file doesn't exist) and returns the new object to write.
 *
 * Unlike raw template files, structured JSON patch targets are merged in-place:
 * the patcher already preserves unknown fields, so reporting drift would strand
 * required hook/config updates behind an extra manual merge step.
 */
export function patchJsonFile(targetPath, patcher, opts = {}) {
    const exists = existsSync(targetPath);
    const existing = exists
        ? JSON.parse(readFileSync(targetPath, 'utf8'))
        : {};
    const patched = patcher(existing);
    const incoming = `${JSON.stringify(patched, null, 2)}\n`;
    const existingContent = exists ? readFileSync(targetPath, 'utf8') : null;
    if (existingContent === incoming) {
        return { targetPath, action: 'identical' };
    }
    if (opts.dryRun) {
        return { targetPath, action: 'skipped-dry' };
    }
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, incoming);
    return { targetPath, action: exists ? 'overwritten' : 'created' };
}
export function summarizeResults(results) {
    const summary = {
        created: 0,
        identical: 0,
        drifted: 0,
        overwritten: 0,
        'skipped-dry': 0,
    };
    for (const r of results)
        summary[r.action]++;
    return summary;
}
//# sourceMappingURL=merge.js.map