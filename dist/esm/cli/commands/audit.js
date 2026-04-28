/**
 * `ak audit <kind>` — packaged repository audits.
 *
 * TPH audits remain script-backed for now because they are Bun-native
 * entrypoints. Repo guardrail audits are library-backed so consumers can
 * use the same logic from the CLI and from `@webpresso/agent-kit/local`.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
function resolveAuditScript(name) {
    // Source layout: `src/cli/commands/audit.ts` → `../../audit/<name>`.
    // After `bun build` the whole CLI is bundled into `dist/cli.js`, so the
    // audit scripts are NOT available at runtime via a relative path; we
    // fall back to the source location under the package root.
    const fromSource = new URL(`../../audit/${name}`, import.meta.url);
    if (existsSync(fromSource)) {
        return fromSource.pathname;
    }
    // Last-resort: look alongside the bundled CLI.
    const bundleDir = path.dirname(new URL(import.meta.url).pathname);
    const packageRoot = path.resolve(bundleDir, '..');
    return path.join(packageRoot, 'src', 'audit', name);
}
async function runAuditScript(script, extraArgs) {
    const runtime = process.env.BUN_INSTALL
        ? 'bun'
        : // Bun ships with these scripts as #!/usr/bin/env bun, so prefer bun if
            // available via PATH. Fall back to node, which will fail clearly if
            // the script uses Bun-only APIs.
            'bun';
    return new Promise((resolve) => {
        const child = spawn(runtime, [script, ...extraArgs], {
            stdio: 'inherit',
        });
        child.on('error', (error) => {
            const reason = error instanceof Error ? error.message : String(error);
            console.error(`Failed to spawn audit runner (${runtime}): ${reason}\nInstall Bun (https://bun.sh) or run the audit script directly.`);
            resolve(1);
        });
        child.on('exit', (code) => {
            resolve(code ?? 1);
        });
    });
}
function buildBundleBudgetArgs(target, options) {
    const args = [];
    if (target)
        args.push(target);
    if (options.dist)
        args.push('--dist', String(options.dist));
    if (options.htmlEntry)
        args.push('--html-entry', String(options.htmlEntry));
    if (options.maxJsAssetBytes)
        args.push('--max-js-asset-bytes', String(options.maxJsAssetBytes));
    if (options.maxHtmlEagerJsAssetBytes) {
        args.push('--max-html-eager-js-asset-bytes', String(options.maxHtmlEagerJsAssetBytes));
    }
    if (options.maxHtmlEagerJsTotalBytes) {
        args.push('--max-html-eager-js-total-bytes', String(options.maxHtmlEagerJsTotalBytes));
    }
    const ignore = Array.isArray(options.ignore)
        ? options.ignore
        : options.ignore
            ? [options.ignore]
            : [];
    for (const ignoredPath of ignore)
        args.push('--ignore', String(ignoredPath));
    return args;
}
export function registerAuditCommand(cli) {
    cli
        .command('audit <kind> [target]', 'Run a packaged audit (tph, tph-e2e, bundle-budget, catalog-drift, commit-message, docs-frontmatter, blueprint-lifecycle, tech-debt, no-relative-parent-imports)')
        .option('--fix', 'Attempt to auto-fix violations (forwarded to supported audits)')
        .option('--json', 'Emit JSON output (forwarded to supported audits)')
        .option('--dist <dir>', 'Built Vite dist directory for bundle-budget')
        .option('--root <dir>', 'Repository root for repo guardrail audits')
        .option('--docs-root <dir>', 'Docs directory for docs-frontmatter')
        .option('--message-file <file>', 'Commit message file for commit-message')
        .option('--require-lore', 'Require Lore trailers (hard-fail on missing/malformed trailers)')
        .option('--lore-warn', 'Warn about missing Lore trailers but always exit 0 (soft adoption mode)')
        .option('--legacy-omx', 'Include legacy .omx plan checks for blueprint-lifecycle')
        .option('--html-entry <file>', 'HTML entry relative to dist for bundle-budget')
        .option('--max-js-asset-bytes <bytes>', 'Max size for any generated JS asset')
        .option('--max-html-eager-js-asset-bytes <bytes>', 'Max size for any HTML-eager JS asset')
        .option('--max-html-eager-js-total-bytes <bytes>', 'Max total size for HTML-eager JS assets')
        .option('--ignore <substring>', 'Ignore matching bundle-budget asset path; repeatable')
        .action(async (kind, target, options) => {
        const forwarded = [];
        if (options.fix)
            forwarded.push('--fix');
        if (options.json)
            forwarded.push('--json');
        if (target)
            forwarded.push(target);
        switch (kind) {
            case 'tph': {
                const script = resolveAuditScript('audit-tph.ts');
                const code = await runAuditScript(script, forwarded);
                process.exit(code);
            }
            case 'tph-e2e': {
                const script = resolveAuditScript('audit-tph-e2e.ts');
                const code = await runAuditScript(script, forwarded);
                process.exit(code);
            }
            case 'bundle-budget': {
                const { runBundleBudgetCli } = await import('../../vite/local.js');
                const bundleBudgetArgs = buildBundleBudgetArgs(target, options);
                const code = await runBundleBudgetCli(bundleBudgetArgs);
                process.exit(code);
            }
            case 'catalog-drift': {
                const { auditCatalogDrift } = await import('#audit/repo-guardrails');
                await exitWithRepoAudit(auditCatalogDrift(options.root ?? target ?? process.cwd()), options);
                return;
            }
            case 'commit-message': {
                const { auditCommitMessageFile } = await import('#audit/repo-guardrails');
                const messageFile = options.messageFile ?? target;
                if (!messageFile) {
                    console.error('commit-message requires a message file target or --message-file <file>.');
                    process.exit(1);
                }
                await exitWithRepoAudit(auditCommitMessageFile(messageFile, {
                    requireLore: options.requireLore,
                    loreWarn: options.loreWarn,
                }), options);
                return;
            }
            case 'docs-frontmatter': {
                const { auditDocsFrontmatter } = await import('#audit/repo-guardrails');
                await exitWithRepoAudit(auditDocsFrontmatter(options.root ?? target ?? process.cwd(), {
                    docsRoot: options.docsRoot,
                }), options);
                return;
            }
            case 'blueprint-lifecycle': {
                const { auditBlueprintLifecycle } = await import('#audit/repo-guardrails');
                await exitWithRepoAudit(auditBlueprintLifecycle(options.root ?? target ?? process.cwd(), {
                    includeLegacyOmx: options.legacyOmx,
                }), options);
                return;
            }
            case 'tech-debt': {
                const { auditTechDebt } = await import('#audit/tech-debt');
                await exitWithRepoAudit(auditTechDebt(options.root ?? target ?? process.cwd()), options);
                return;
            }
            case 'no-relative-parent-imports': {
                const { auditNoRelativeParentImports } = await import('#audit/repo-guardrails');
                await exitWithRepoAudit(auditNoRelativeParentImports(options.root ?? target ?? process.cwd()), options);
                return;
            }
            default: {
                console.error(`Unknown audit kind: ${kind}. Use 'tph', 'tph-e2e', 'bundle-budget', 'catalog-drift', 'commit-message', 'docs-frontmatter', 'blueprint-lifecycle', 'tech-debt', or 'no-relative-parent-imports'.`);
                process.exit(1);
            }
        }
    });
}
async function exitWithRepoAudit(auditResult, options) {
    const { formatRepoAuditReport } = await import('#audit/repo-guardrails');
    if (options.json) {
        console.log(JSON.stringify(auditResult, null, 2));
    }
    else {
        console.log(formatRepoAuditReport(auditResult));
    }
    process.exit(auditResult.ok ? 0 : 1);
}
//# sourceMappingURL=audit.js.map