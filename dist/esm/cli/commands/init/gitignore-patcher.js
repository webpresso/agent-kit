/**
 * Idempotent `.gitignore` patcher anchored by marker comments.
 *
 * Each managed block is wrapped between:
 *   # >>> managed by @webpresso/agent-kit (<id>)
 *   <patterns>
 *   # <<< managed by @webpresso/agent-kit (<id>)
 *
 * Re-running the patcher detects an existing block by id and either leaves
 * it alone (when content matches) or rewrites just that block (overwrite or
 * drift). Other content in `.gitignore` — including unrelated managed blocks
 * from other scaffolders — is preserved verbatim.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const BEGIN = (id) => `# >>> managed by @webpresso/agent-kit (${id})`;
const END = (id) => `# <<< managed by @webpresso/agent-kit (${id})`;
function renderBlock(block) {
    return [BEGIN(block.id), ...block.patterns, END(block.id)].join('\n');
}
function findBlock(content, id) {
    const begin = BEGIN(id);
    const end = END(id);
    const lines = content.split('\n');
    let startLine = -1;
    let endLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i] === begin && startLine === -1)
            startLine = i;
        else if (lines[i] === end && startLine !== -1) {
            endLine = i;
            break;
        }
    }
    if (startLine === -1 || endLine === -1)
        return null;
    return { start: startLine, end: endLine };
}
export function patchGitignore(targetPath, block, opts = {}) {
    const exists = existsSync(targetPath);
    const original = exists ? readFileSync(targetPath, 'utf8') : '';
    const rendered = renderBlock(block);
    let next;
    let action;
    const found = findBlock(original, block.id);
    if (found) {
        const lines = original.split('\n');
        const currentBlock = lines.slice(found.start, found.end + 1).join('\n');
        if (currentBlock === rendered) {
            return { targetPath, action: 'identical' };
        }
        if (!opts.overwrite) {
            // Drift: existing block diverges from canonical content. Leave it alone
            // (consumer-edited) and surface drift.
            return { targetPath, action: 'drifted' };
        }
        const before = lines.slice(0, found.start);
        const after = lines.slice(found.end + 1);
        next = [...before, rendered, ...after].join('\n');
        action = 'overwritten';
    }
    else {
        if (original.length === 0) {
            next = `${rendered}\n`;
        }
        else {
            const sep = original.endsWith('\n') ? '\n' : '\n\n';
            next = original.endsWith('\n')
                ? `${original}\n${rendered}\n`
                : `${original}${sep}${rendered}\n`;
        }
        action = exists ? 'overwritten' : 'created';
    }
    if (opts.dryRun) {
        return { targetPath, action: 'skipped-dry' };
    }
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, next);
    return { targetPath, action };
}
//# sourceMappingURL=gitignore-patcher.js.map