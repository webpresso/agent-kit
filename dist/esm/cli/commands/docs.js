/**
 * `ak docs lint <path>` — run the blueprint-plan validator over a markdown
 * file or directory.
 *
 * Walks the target path, runs `validateBlueprintPlan` on every `.md` file
 * with a frontmatter `doc-type: blueprint`, and prints a flat report.
 * Exits non-zero when any error-severity violation is found.
 */
import matter from 'gray-matter';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { validateBlueprintPlan } from '#docs-linter/blueprint-plan';
function isMarkdownFile(filePath) {
    return filePath.endsWith('.md') || filePath.endsWith('.mdx');
}
function walkMarkdownFiles(root) {
    const out = [];
    const stat = statSync(root);
    if (stat.isFile()) {
        if (isMarkdownFile(root))
            out.push(root);
        return out;
    }
    if (!stat.isDirectory())
        return out;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules')
            continue;
        const child = path.join(root, entry.name);
        if (entry.isDirectory()) {
            out.push(...walkMarkdownFiles(child));
        }
        else if (entry.isFile() && isMarkdownFile(child)) {
            out.push(child);
        }
    }
    return out;
}
function detectDocType(content) {
    try {
        const parsed = matter(content);
        const data = parsed.data;
        return data['doc-type'] ?? data.docType ?? data.type ?? '';
    }
    catch {
        return '';
    }
}
function formatError(error) {
    const location = error.line ? `:${error.line}${error.column ? `:${error.column}` : ''}` : '';
    const ruleId = error.ruleId ? ` [${error.ruleId}]` : '';
    return `${error.file}${location} ${error.severity.toUpperCase()}${ruleId} ${error.message}`;
}
async function runDocsLint(target) {
    const absoluteTarget = path.resolve(process.cwd(), target);
    const files = walkMarkdownFiles(absoluteTarget);
    if (!files.length) {
        console.log(`No markdown files found at ${absoluteTarget}.`);
        return 0;
    }
    const allErrors = [];
    let blueprintFiles = 0;
    for (const file of files) {
        const raw = readFileSync(file, 'utf-8');
        const docType = detectDocType(raw);
        if (docType !== 'blueprint')
            continue;
        blueprintFiles++;
        allErrors.push(...validateBlueprintPlan(file, raw, docType));
    }
    if (!blueprintFiles) {
        console.log(`No blueprint documents found at ${absoluteTarget} (files must declare \`doc-type: blueprint\` in frontmatter).`);
        return 0;
    }
    if (!allErrors.length) {
        console.log(`✓ ${blueprintFiles} blueprint document(s) passed.`);
        return 0;
    }
    for (const error of allErrors) {
        console.log(formatError(error));
    }
    const errorCount = allErrors.filter((e) => e.severity === 'error').length;
    const warningCount = allErrors.filter((e) => e.severity === 'warning').length;
    console.log(`\n${errorCount} error(s), ${warningCount} warning(s) across ${blueprintFiles} blueprint(s).`);
    return errorCount > 0 ? 1 : 0;
}
function handleDocsError(error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
}
export function registerDocsCommand(cli) {
    cli
        .command('docs <action> [target]', 'Documentation tooling (lint)')
        .action(async (action, target) => {
        try {
            if (action !== 'lint') {
                throw new Error(`Unknown docs action: ${action}. Use 'lint'.`);
            }
            if (!target) {
                throw new Error('Usage: ak docs lint <path>');
            }
            const code = await runDocsLint(target);
            process.exit(code);
        }
        catch (error) {
            handleDocsError(error);
        }
    });
}
//# sourceMappingURL=docs.js.map