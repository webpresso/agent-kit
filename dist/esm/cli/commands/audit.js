/**
 * `wp audit <kind>` — packaged repository audits.
 *
 * CAC shell: maps AuditOutcome → console output + process.exit.
 * All dispatch logic lives in audit-core.ts (no process.exit there).
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runAuditDispatch } from './audit-core.js';
import { runStryker } from '#audit/run-stryker';
const REPO_AUDIT_REGISTRY = {
    'catalog-drift': async (root) => (await import('#audit/repo-guardrails')).auditCatalogDrift(root),
    'package-surface': async (root) => (await import('#audit/package-surface')).auditPackageSurface(root),
    'blueprint-lifecycle': async (root, _options) => (await import('#audit/blueprint-lifecycle-sql')).auditBlueprintLifecycleSql(root),
    'roadmap-links': async (root, options) => (await import('#audit/roadmap-links')).auditRoadmapLinks(root, {
        failOrphans: options.strict,
    }),
    'docs-frontmatter': async (root, options) => (await import('#audit/repo-guardrails')).auditDocsFrontmatter(root, {
        docsRoot: options.docsRoot,
    }),
    agents: async (root) => (await import('#audit/agents')).auditAgents(root),
    vision: async (root, options) => (await import('#audit/vision-doc')).auditVision(root, {
        visionPath: options.visionPath,
    }),
    'tech-debt': async (root) => (await import('#audit/tech-debt')).auditTechDebt(root),
    'no-relative-parent-imports': async (root) => (await import('#audit/repo-guardrails')).auditNoRelativeParentImports(root, {
        // config/docs-lint is a published package that uses within-package relative
        // imports between its own sibling directories — exclude from this audit.
        excludeDirs: ['config/docs-lint'],
    }),
    'no-link-protocol': async (root) => (await import('#audit/repo-guardrails')).auditNoLinkProtocol(root),
    'no-relative-package-scripts': async (root) => (await import('#audit/repo-guardrails')).auditNoRelativePackageScripts(root),
    'bucket-boundary': async (root, options) => (await import('#audit/bucket-boundary')).auditBucketBoundary(root, {
        changedOnly: options.changedOnly,
        strict: options.strict,
    }),
    'skill-sizes': async (root, options) => (await import('#audit/skill-sizes')).auditSkillSizesAsRepoResult(root, {
        staged: options.staged,
    }),
    'broken-refs': async (root, options) => {
        const result = (await import('#audit/broken-refs')).auditBrokenRefsAsRepoResult(root, {
            staged: options.staged,
        });
        return {
            ok: result.ok,
            title: result.title,
            checked: result.checked,
            violations: result.violations,
        };
    },
    'memory-rotation': async (root, options) => (await import('#audit/memory-rotation')).auditMemoryRotationAsRepoResult(root, {
        strict: options.strict,
    }),
    'gitignore-agent-surfaces': async (root) => (await import('#audit/gitignore-agent-surfaces')).auditGitignoreAgentSurfaces(root),
    'memory-unified': async (root) => (await import('#audit/memory-unified')).auditMemoryUnified(root),
    'compile-drift': async (root) => (await import('#audit/compile-drift')).auditCompileDrift(root),
    'architecture-drift': async (root) => (await import('#audit/architecture-drift')).auditArchitectureDrift(root),
    'agent-cost': async (root) => (await import('#audit/agent-cost')).auditAgentCost(root),
    'blueprint-db-consistency': async (root) => (await import('#audit/blueprint-db-consistency')).auditBlueprintDbConsistency(root),
    'blueprint-lifecycle-sql': async (root) => (await import('#audit/blueprint-lifecycle-sql')).auditBlueprintLifecycleSql(root),
    'tech-debt-cadence': async (root) => (await import('#audit/tech-debt-cadence')).auditTechDebtCadence(root),
    'cross-repo-correlation': async (root) => (await import('#audit/cross-repo-correlation')).auditCrossRepoCorrelationAsRepoResult(root),
    'ai-contracts': async (root) => (await import('#audit/ai-contracts')).auditAiContracts(root),
    'hook-surface': async (root) => (await import('#audit/hook-surface')).auditHookSurfaceAsRepoResult(root),
    rules: async (root) => runContentAudit(root, 'rule'),
    skills: async (root) => runContentAudit(root, 'skill'),
};
async function runContentAudit(root, kind) {
    const { auditContent } = await import('../../content/audit.js');
    const { resolvePackageAsset } = await import('#utils/package-assets');
    const catalogDir = resolvePackageAsset('catalog/agent');
    const result = auditContent({ catalogDir, consumerRoot: root, kind });
    const violations = result.findings.map((f) => ({
        file: f.filePath,
        message: f.severity === 'warning'
            ? `[warn] ${kind}:${f.slug} — ${f.message}`
            : `${kind}:${f.slug} — ${f.message}`,
    }));
    return {
        ok: result.passed,
        title: kind === 'rule' ? 'Consumer rules audit' : 'Consumer skills audit',
        checked: result.findings.length,
        violations,
    };
}
const REPO_AUDIT_KINDS = Object.keys(REPO_AUDIT_REGISTRY);
export function resolveGuardrailAuditKinds(root) {
    if (isAgentKitRoot(root))
        return REPO_AUDIT_KINDS;
    return REPO_AUDIT_KINDS.filter((kind) => kind !== 'ai-contracts');
}
function isAgentKitRoot(root) {
    try {
        const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
        if (packageJson.name === '@webpresso/agent-kit')
            return true;
    }
    catch {
        // Fall through to source-layout detection below.
    }
    return existsSync(path.join(root, 'src/mcp/tools/_shared/result.ts'));
}
const SCRIPT_AUDIT_KINDS = ['tph', 'tph-e2e'];
const SPECIAL_AUDIT_KINDS = [
    'bundle-budget',
    'commit-message',
    'mutation',
    'guardrails',
    'quality',
];
const AUDIT_KINDS = [
    ...SCRIPT_AUDIT_KINDS,
    ...SPECIAL_AUDIT_KINDS.slice(0, 2),
    ...REPO_AUDIT_KINDS,
    ...SPECIAL_AUDIT_KINDS.slice(2),
];
const AUDIT_KIND_LIST = AUDIT_KINDS.join(', ');
function resolveAuditScript(name) {
    const fromSource = new URL(`../../audit/${name}`, import.meta.url);
    if (existsSync(fromSource)) {
        return fromSource.pathname;
    }
    const bundleDir = path.dirname(new URL(import.meta.url).pathname);
    const packageRoot = path.resolve(bundleDir, '..');
    return path.join(packageRoot, 'src', 'audit', name);
}
async function runAuditScript(script, extraArgs) {
    const runtime = process.env.BUN_INSTALL ? 'bun' : 'bun';
    return new Promise((resolve) => {
        const child = spawn(runtime, [script, ...extraArgs], { stdio: 'inherit' });
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
async function printAndExitRepoAudit(auditResult, options) {
    const { formatRepoAuditReport } = await import('#audit/repo-guardrails');
    if (options.json) {
        console.log(JSON.stringify(auditResult, null, 2));
    }
    else {
        console.log(formatRepoAuditReport(auditResult));
    }
    process.exit(auditResult.ok ? 0 : 1);
}
export function registerAuditCommand(cli) {
    cli
        .command('audit [kind] [target]', `Run a packaged audit (${AUDIT_KIND_LIST})`)
        .option('--fix', 'Attempt to auto-fix violations (forwarded to supported audits)')
        .option('--json', 'Emit JSON output (forwarded to supported audits)')
        .option('--dist <dir>', 'Built Vite dist directory for bundle-budget')
        .option('--root <dir>', 'Repository root for repo guardrail audits')
        .option('--strict', 'Zero-tolerance mode: all violations are errors (bucket-boundary)')
        .option('--changed-only', 'Restrict to packages touched in git diff --name-only origin/main (bucket-boundary)')
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
        .option('--vision-path <path>', "Path to VISION.md for the 'vision' audit (default: VISION.md)")
        .option('--staged', 'Only audit git-staged files (fast pre-commit mode)')
        .action(async (kind, target, options) => {
        const auditRoot = options.root ?? target ?? process.cwd();
        const outcome = await runAuditDispatch(kind, target ? [target] : [], options, {
            root: process.cwd(),
            runStryker: (cwd) => runStryker(cwd),
            runScript: (script, args) => runAuditScript(script, args),
            runRepoAudit: async (name, root, opts) => {
                const runner = REPO_AUDIT_REGISTRY[name];
                if (!runner)
                    throw new Error(`Unknown repo audit kind: ${name}`);
                return runner(root, opts);
            },
            runBundleBudget: async (args) => {
                const { runBundleBudgetCli } = await import('../../vite/local.js');
                return runBundleBudgetCli(args);
            },
            runCommitMessageAudit: async (messageFile, opts) => {
                const { auditCommitMessageFile } = await import('#audit/repo-guardrails');
                return auditCommitMessageFile(messageFile, {
                    requireLore: opts.requireLore,
                    loreWarn: opts.loreWarn,
                });
            },
            resolveScript: resolveAuditScript,
            buildBundleBudgetArgs,
            knownRepoKinds: kind === 'guardrails' || kind === 'quality'
                ? resolveGuardrailAuditKinds(auditRoot)
                : REPO_AUDIT_KINDS,
        });
        switch (outcome.kind) {
            case 'invalid-usage': {
                console.error(kind ? outcome.message : `Usage: wp audit <kind> [target]\nKinds: ${AUDIT_KIND_LIST}`);
                process.exit(1);
            }
            case 'unknown-kind': {
                console.error(`Unknown audit kind: ${outcome.auditKind}. Use one of: ${AUDIT_KIND_LIST}.`);
                process.exit(1);
            }
            case 'script-exit': {
                process.exit(outcome.code);
            }
            case 'repo-result': {
                await printAndExitRepoAudit(outcome.result, options);
                break;
            }
            case 'aggregate-result': {
                const { formatRepoAuditReport } = await import('#audit/repo-guardrails');
                for (const { name, result } of outcome.results) {
                    if (result.ok)
                        continue;
                    console.log(`\n[${name}]`);
                    console.log(formatRepoAuditReport(result));
                }
                const failed = outcome.results.filter(({ result }) => !result.ok);
                if (failed.length > 0) {
                    console.error(`\nguardrails: ${failed.length}/${outcome.results.length} audits failed: ${failed
                        .map(({ name }) => name)
                        .join(', ')}`);
                }
                process.exit(outcome.code);
            }
            case 'quality-exit': {
                if (outcome.mutationCode !== 0) {
                    console.error('[quality] mutation: FAILED');
                }
                else {
                    console.log('[quality] mutation: OK');
                }
                process.exit(outcome.code);
            }
        }
    });
}
//# sourceMappingURL=audit.js.map