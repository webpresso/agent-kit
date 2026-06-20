/**
 * `wp audit <kind>` — packaged repository audits.
 *
 * CAC shell: maps AuditOutcome → console output + process.exit.
 * All dispatch logic lives in audit-core.ts (no process.exit there).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runAuditDispatch } from './audit-core.js';
import { createCliLogSink } from './quality-log-store.js';
import { emitCliCommandOutput, runLoggedChildCommand } from './quality-runner.js';
const REPO_AUDIT_REGISTRY = {
    'catalog-drift': async (root) => (await import('#audit/repo-guardrails')).auditCatalogDrift(root),
    'package-surface': async (root) => (await import('#audit/package-surface')).auditPackageSurface(root),
    'reference-parity-matrix': async (root, options) => (await import('#audit/reference-parity-matrix')).auditReferenceParityMatrix(root, undefined, {
        requireReleaseReady: options.strict,
    }),
    'blueprint-readme-drift': async (root, options) => (await import('#audit/blueprint-readme-drift')).auditBlueprintReadmeDrift(root, {
        fix: options.fix,
    }),
    'blueprint-lifecycle': async (root, options) => (await import('#audit/blueprint-lifecycle-sql')).auditBlueprintLifecycleSql(root, {
        includeOmxPlans: options.omxPlans,
    }),
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
    'test-isolation': async (root) => (await import('#audit/repo-guardrails')).auditTestIsolation(root),
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
    'no-legacy-cli-bin': async (root) => (await import('#audit/no-legacy-cli-bin')).auditNoLegacyCliBin(root),
    'architecture-drift': async (root) => (await import('#audit/architecture-drift')).auditArchitectureDrift(root),
    'cloudflare-deploy-contract': async (root) => (await import('#audit/cloudflare-deploy-contract')).auditCloudflareDeployContract(root),
    'toolchain-isolation': async (root) => (await import('#audit/toolchain-isolation')).auditToolchainIsolation(root),
    'absolute-path-policy': async (root) => (await import('#audit/absolute-path-policy')).auditAbsolutePathPolicy(root),
    'no-first-party-mjs': async (root) => (await import('#audit/no-first-party-mjs')).auditNoFirstPartyMjs(root),
    'agent-cost': async (root) => (await import('#audit/agent-cost')).auditAgentCost(root),
    'blueprint-db-consistency': async (root) => (await import('#audit/blueprint-db-consistency')).auditBlueprintDbConsistency(root),
    'tech-debt-cadence': async (root) => (await import('#audit/tech-debt-cadence')).auditTechDebtCadence(root),
    'cross-repo-correlation': async (root) => (await import('#audit/cross-repo-correlation')).auditCrossRepoCorrelationAsRepoResult(root),
    'ai-contracts': async (root) => (await import('#audit/ai-contracts')).auditAiContracts(root),
    'hook-surface': async (root) => (await import('#audit/hook-surface')).auditHookSurfaceAsRepoResult(root),
    'hook-vendor-drift': async (root) => {
        const { auditHookVendorDrift } = await import('#audit/hook-vendor-drift');
        const report = await auditHookVendorDrift({ repoRoot: root });
        return {
            ok: report.exitCode === 0,
            title: 'Hook vendor drift audit',
            checked: report.findings.length === 0 ? 1 : report.findings.length,
            violations: report.findings.map((f) => ({
                message: `${f.vendor}/${f.event}: expected=${f.expected} actual=${f.actual} [${f.severity}]`,
            })),
        };
    },
    'session-memory-hardcut': async (root) => (await import('#audit/session-memory-hardcut')).auditSessionMemoryHardcut(root),
    'open-source-licenses': async (root) => (await import('#audit/open-source-licenses')).auditOpenSourceLicenses(root),
    'secrets-policy': async (root) => (await import('#audit/secrets-policy')).auditSecretsPolicy(root),
    'no-dev-vars': async (root) => (await import('#audit/no-dev-vars')).auditNoDevVars(root),
    'secret-provider-quarantine': async (root) => (await import('#audit/secret-provider-quarantine')).auditSecretProviderQuarantine(root),
    'secrets-config': async (root) => (await import('#audit/secrets-config')).auditSecretsConfig(root),
    'consumer-agent-kit-dependency': async (root) => (await import('#audit/consumer-agent-kit-dependency')).auditConsumerAgentKitDependency(root),
    'harness-surfaces': async (root) => (await import('#audit/harness-surfaces')).auditHarnessSurfaces(root),
    'weakness-mining': async (root, options) => (await import('#audit/weakness-mining/index')).auditWeaknessMining(root, {
        draftTechDebt: options.draftTechDebt,
    }),
    'harness-overlay-evidence': async (root) => (await import('#audit/harness-overlay-evidence')).auditHarnessOverlayEvidence(root),
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
    return REPO_AUDIT_KINDS.filter((kind) => kind !== 'ai-contracts' && kind !== 'absolute-path-policy');
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
    'blueprint-pr-coverage',
    'mutation',
    'guardrails',
    'quality',
];
const AUDIT_KINDS = [
    ...SCRIPT_AUDIT_KINDS,
    ...SPECIAL_AUDIT_KINDS.slice(0, 3),
    ...REPO_AUDIT_KINDS,
    ...SPECIAL_AUDIT_KINDS.slice(3),
];
const AUDIT_KIND_LIST = AUDIT_KINDS.join(', ');
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
        .command('audit [kind] [target]', `Run a packaged audit (${AUDIT_KIND_LIST})`)
        .option('--fix', 'Attempt to auto-fix violations (forwarded to supported audits)')
        .option('--json', 'Emit JSON output (forwarded to supported audits)')
        .option('--full', 'Print the full raw output instead of the default summary-first view')
        .option('--dist <dir>', 'Built Vite dist directory for bundle-budget')
        .option('--root <dir>', 'Repository root for repo guardrail audits')
        .option('--strict', 'Zero-tolerance mode: all violations are errors; reference-parity-matrix also requires release readiness')
        .option('--changed-only', 'Restrict to packages touched in git diff --name-only origin/main (bucket-boundary)')
        .option('--docs-root <dir>', 'Docs directory for docs-frontmatter')
        .option('--draft-tech-debt', 'Draft a tech-debt item for supported audit findings')
        .option('--message-file <file>', 'Commit message file for commit-message')
        .option('--base <ref>', 'Base ref/SHA for PR-scoped audits such as blueprint-pr-coverage')
        .option('--require-lore', 'Require Lore trailers (hard-fail on missing/malformed trailers)')
        .option('--lore-warn', 'Warn about missing Lore trailers but always exit 0 (soft adoption mode)')
        .option('--omx-plans', 'Also audit .omx/plans derived-handoff governance for blueprint-lifecycle')
        .option('--html-entry <file>', 'HTML entry relative to dist for bundle-budget')
        .option('--max-js-asset-bytes <bytes>', 'Max size for any generated JS asset')
        .option('--max-html-eager-js-asset-bytes <bytes>', 'Max size for any HTML-eager JS asset')
        .option('--max-html-eager-js-total-bytes <bytes>', 'Max total size for HTML-eager JS assets')
        .option('--ignore <substring>', 'Ignore matching bundle-budget asset path; repeatable')
        .option('--vision-path <path>', "Path to VISION.md for the 'vision' audit (default: VISION.md)")
        .option('--staged', 'Only audit git-staged files (fast pre-commit mode)')
        .action(async (kind, target, options) => {
        const auditRoot = options.root ?? target ?? process.cwd();
        const sink = createCliLogSink('audit', process.cwd());
        const outcome = await runAuditDispatch(kind, target ? [target] : [], options, {
            root: process.cwd(),
            runStryker: async (cwd) => {
                const result = await runLoggedChildCommand({ command: 'vp', args: ['dlx', 'stryker', 'run'], cwd }, { write: (chunk) => sink.write(chunk) });
                return result.exitCode;
            },
            runRepoAudit: async (name, root, opts) => {
                const runner = REPO_AUDIT_REGISTRY[name];
                if (!runner)
                    throw new Error(`Unknown repo audit kind: ${name}`);
                return runner(root, opts);
            },
            runBundleBudget: async (args) => {
                const { runBundleBudgetCli } = await import('../../vite/local.js');
                return captureConsoleToSink(() => runBundleBudgetCli(args), sink.write);
            },
            runCommitMessageAudit: async (messageFile, opts) => {
                const { auditCommitMessageFile } = await import('#audit/repo-guardrails');
                return auditCommitMessageFile(messageFile, {
                    requireLore: opts.requireLore,
                    loreWarn: opts.loreWarn,
                });
            },
            buildBundleBudgetArgs,
            knownRepoKinds: kind === 'guardrails' || kind === 'quality'
                ? resolveGuardrailAuditKinds(auditRoot)
                : REPO_AUDIT_KINDS,
        });
        let exitCode = 1;
        let summary = kind ? `audit ${kind} failed` : 'audit failed';
        switch (outcome.kind) {
            case 'invalid-usage': {
                sink.write(`${kind ? outcome.message : `Usage: wp audit <kind> [target]\nKinds: ${AUDIT_KIND_LIST}`}\n`);
                summary = 'audit failed: invalid usage';
                break;
            }
            case 'unknown-kind': {
                sink.write(`Unknown audit kind: ${outcome.auditKind}. Use one of: ${AUDIT_KIND_LIST}.\n`);
                summary = `audit ${outcome.auditKind} failed: unknown kind`;
                break;
            }
            case 'script-exit': {
                exitCode = outcome.code;
                summary =
                    kind === undefined
                        ? `audit failed (exit ${outcome.code})`
                        : outcome.code === 0
                            ? `audit ${kind} passed`
                            : `audit ${kind} failed (exit ${outcome.code})`;
                break;
            }
            case 'repo-result': {
                exitCode = outcome.result.ok ? 0 : 1;
                sink.write(await formatAuditResult(outcome.result, options));
                summary =
                    kind === undefined
                        ? exitCode === 0
                            ? 'audit passed'
                            : 'audit failed'
                        : exitCode === 0
                            ? `audit ${kind} passed`
                            : `audit ${kind} failed`;
                break;
            }
            case 'aggregate-result': {
                const { formatRepoAuditReport } = await import('#audit/repo-guardrails');
                for (const { name, result } of outcome.results) {
                    if (result.ok)
                        continue;
                    sink.write(`\n[${name}]\n${formatRepoAuditReport(result)}\n`);
                }
                const failed = outcome.results.filter(({ result }) => !result.ok);
                if (failed.length > 0) {
                    sink.write(`\nguardrails: ${failed.length}/${outcome.results.length} audits failed: ${failed
                        .map(({ name }) => name)
                        .join(', ')}\n`);
                }
                exitCode = outcome.code;
                summary =
                    outcome.code === 0
                        ? 'audit guardrails passed'
                        : `audit guardrails failed (${failed.length}/${outcome.results.length})`;
                break;
            }
            case 'quality-exit': {
                sink.write(outcome.mutationCode !== 0
                    ? '[quality] mutation: FAILED\n'
                    : '[quality] mutation: OK\n');
                if (outcome.guardrailsCode !== 0) {
                    sink.write('[quality] guardrails: FAILED\n');
                }
                else {
                    sink.write('[quality] guardrails: OK\n');
                }
                exitCode = outcome.code;
                summary =
                    outcome.code === 0
                        ? 'audit quality passed'
                        : `audit quality failed (mutation=${outcome.mutationCode}, guardrails=${outcome.guardrailsCode})`;
                break;
            }
        }
        const entry = await sink.finalize({
            exitCode,
            summary,
            options: {
                kind,
                target,
                ...options,
            },
        });
        emitCliCommandOutput({
            entry,
            summary,
            passed: exitCode === 0,
            full: Boolean(options.full),
            rawMode: Boolean(options.json),
            toolName: `wp_audit-${kind ?? 'unknown'}`,
        });
        return exitCode;
    });
}
async function formatAuditResult(auditResult, options) {
    const { formatRepoAuditReport } = await import('#audit/repo-guardrails');
    return options.json
        ? `${JSON.stringify(auditResult, null, 2)}\n`
        : `${formatRepoAuditReport(auditResult)}\n`;
}
async function captureConsoleToSink(run, write) {
    const originalLog = console.log;
    const originalError = console.error;
    try {
        console.log = (...args) => {
            write(`${args.map(String).join(' ')}\n`);
        };
        console.error = (...args) => {
            write(`${args.map(String).join(' ')}\n`);
        };
        return await run();
    }
    finally {
        console.log = originalLog;
        console.error = originalError;
    }
}
//# sourceMappingURL=audit.js.map