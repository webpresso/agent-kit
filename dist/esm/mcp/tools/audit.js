/**
 * `wp_audit` MCP tool.
 *
 * Wraps the existing `wp audit *` subcommands behind one MCP tool with a
 * `kind` enum. Returns a structured `{passed, kind, details}` payload wrapped
 * in MCP `text` content blocks.
 *
 * Most kinds dispatch directly to the library functions exported from
 * `#audit/repo-guardrails`, `#audit/tech-debt`, and `../../vite/local`.
 * The `tph` kind shells out to `bun` because the implementation is a
 * Bun-native script (`src/audit/audit-tph.ts`).
 *
 * Audit failures (whether represented as `ok: false` from the library or
 * as a thrown error) are caught and returned as `{passed: false, ...}`
 * — the handler never throws out, so the MCP server stays responsive.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { resolvePackageAsset } from '#utils/package-assets';
import { applyOutputTransform } from '#output-transforms/index';
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js';
const KINDS = [
    'tph',
    'tph-e2e',
    'agents',
    'catalog-drift',
    'package-surface',
    'docs-frontmatter',
    'blueprint-lifecycle',
    'architecture-drift',
    'roadmap-links',
    'bundle-budget',
    'commit-message',
    'tech-debt',
    'hook-surface',
    'ai-contracts',
    'no-relative-package-scripts',
];
const inputSchema = z.object({
    kind: z.enum(KINDS),
    /** Working tree to run the audit against. Alias kept as `directory` for back-compat. */
    cwd: z.string().optional(),
    directory: z.string().optional(),
    messageFile: z.string().optional(),
});
const repoAuditSchema = z.object({
    ok: z.boolean(),
    title: z.string().optional(),
    checked: z.number().optional(),
    violations: z
        .array(z.object({
        message: z.string(),
        file: z.string().optional(),
    }))
        .optional(),
});
const outputSchema = createSummaryOutputSchema({
    details: z.union([repoAuditSchema, z.object({ exitCode: z.number() }), z.string()]),
}).extend({
    kind: z.enum(KINDS),
});
function resolveAuditScript(name) {
    // Source layout: `src/mcp/tools/audit.ts` → `../../audit/<name>`.
    const fromSource = new URL(`../../audit/${name}`, import.meta.url);
    if (existsSync(fromSource)) {
        return fromSource.pathname;
    }
    return resolvePackageAsset(`src/audit/${name}`);
}
async function runScript(script) {
    return new Promise((resolve) => {
        const child = spawn('bun', [script], { stdio: 'pipe' });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk) => {
            stdout += chunk.toString('utf8');
        });
        child.stderr?.on('data', (chunk) => {
            stderr += chunk.toString('utf8');
        });
        child.on('error', (error) => resolve({ exitCode: 1, output: [stdout, stderr, error.message].filter(Boolean).join('') }));
        child.on('close', (code) => resolve({ exitCode: code ?? 1, output: [stdout, stderr].filter(Boolean).join('') }));
    });
}
function wrap(payload, options = {}) {
    return createSummaryResult(payload, options);
}
function summarizeRepoAudit(kind, result) {
    const violationCount = result.violations?.length ?? 0;
    if (result.ok) {
        const checked = typeof result.checked === 'number' ? ` (${result.checked} checked)` : '';
        return `${kind} audit passed${checked}`;
    }
    return `${kind} audit failed with ${violationCount} violation${violationCount === 1 ? '' : 's'}`;
}
function summarizeExitCode(kind, exitCode) {
    return exitCode === 0 ? `${kind} audit passed` : `${kind} audit failed (exit ${exitCode})`;
}
async function dispatch(input) {
    const { kind } = input;
    switch (kind) {
        case 'catalog-drift': {
            const { auditCatalogDrift } = await import('#audit/repo-guardrails');
            const auditResult = auditCatalogDrift(input.cwd ?? input.directory ?? process.cwd());
            return {
                passed: auditResult.ok,
                summary: summarizeRepoAudit(kind, auditResult),
                kind,
                details: auditResult,
            };
        }
        case 'package-surface': {
            const { auditPackageSurface } = await import('#audit/package-surface');
            const auditResult = auditPackageSurface(input.cwd ?? input.directory ?? process.cwd());
            return {
                passed: auditResult.ok,
                summary: summarizeRepoAudit(kind, auditResult),
                kind,
                details: auditResult,
            };
        }
        case 'agents': {
            const { auditAgents } = await import('#audit/agents');
            const auditResult = auditAgents(input.cwd ?? input.directory ?? process.cwd());
            return {
                passed: auditResult.ok,
                summary: summarizeRepoAudit(kind, auditResult),
                kind,
                details: auditResult,
            };
        }
        case 'docs-frontmatter': {
            const { auditDocsFrontmatter } = await import('#audit/repo-guardrails');
            const auditResult = auditDocsFrontmatter(input.cwd ?? input.directory ?? process.cwd());
            return {
                passed: auditResult.ok,
                summary: summarizeRepoAudit(kind, auditResult),
                kind,
                details: auditResult,
            };
        }
        case 'blueprint-lifecycle': {
            const { auditBlueprintLifecycle } = await import('#audit/repo-guardrails');
            const auditResult = auditBlueprintLifecycle(input.cwd ?? input.directory ?? process.cwd());
            return {
                passed: auditResult.ok,
                summary: summarizeRepoAudit(kind, auditResult),
                kind,
                details: auditResult,
            };
        }
        case 'architecture-drift': {
            const { auditArchitectureDrift } = await import('#audit/architecture-drift');
            const auditResult = auditArchitectureDrift(input.cwd ?? input.directory ?? process.cwd());
            return {
                passed: auditResult.ok,
                summary: summarizeRepoAudit(kind, auditResult),
                kind,
                details: auditResult,
            };
        }
        case 'roadmap-links': {
            const { auditRoadmapLinks } = await import('#audit/roadmap-links');
            const auditResult = auditRoadmapLinks(input.cwd ?? input.directory ?? process.cwd());
            return {
                passed: auditResult.ok,
                summary: summarizeRepoAudit(kind, auditResult),
                kind,
                details: auditResult,
            };
        }
        case 'commit-message': {
            const messageFile = input.messageFile ?? input.cwd ?? input.directory;
            if (!messageFile) {
                return {
                    passed: false,
                    summary: 'commit-message audit could not run: message file missing',
                    kind,
                    details: 'commit-message requires a message file via `messageFile` or `directory`.',
                };
            }
            const { auditCommitMessageFile } = await import('#audit/repo-guardrails');
            const auditResult = auditCommitMessageFile(messageFile);
            return {
                passed: auditResult.ok,
                summary: summarizeRepoAudit(kind, auditResult),
                kind,
                details: auditResult,
            };
        }
        case 'tech-debt': {
            const { auditTechDebt } = await import('#audit/tech-debt');
            const auditResult = auditTechDebt(input.cwd ?? input.directory ?? process.cwd());
            return {
                passed: auditResult.ok,
                summary: summarizeRepoAudit(kind, auditResult),
                kind,
                details: auditResult,
            };
        }
        case 'ai-contracts': {
            const { auditAiContracts } = await import('#audit/ai-contracts');
            const auditResult = auditAiContracts(input.cwd ?? input.directory ?? process.cwd());
            return {
                passed: auditResult.ok,
                summary: summarizeRepoAudit(kind, auditResult),
                kind,
                details: auditResult,
            };
        }
        case 'bundle-budget': {
            const { runBundleBudgetCli } = await import('../../vite/local.js');
            const args = (input.cwd ?? input.directory) ? [input.cwd ?? input.directory] : [];
            const exitCode = await runBundleBudgetCli(args);
            return {
                passed: exitCode === 0,
                summary: summarizeExitCode(kind, exitCode),
                kind,
                details: { exitCode },
            };
        }
        case 'tph': {
            const script = resolveAuditScript('audit-tph.ts');
            const { exitCode, output } = await runScript(script);
            return {
                passed: exitCode === 0,
                summary: summarizeExitCode(kind, exitCode),
                kind,
                details: { exitCode },
                ...applyOutputTransform(output, { toolName: `wp_audit-${kind}` }),
            };
        }
        case 'tph-e2e': {
            const script = resolveAuditScript('audit-tph-e2e.ts');
            const { exitCode, output } = await runScript(script);
            return {
                passed: exitCode === 0,
                summary: summarizeExitCode(kind, exitCode),
                kind,
                details: { exitCode },
                ...applyOutputTransform(output, { toolName: `wp_audit-${kind}` }),
            };
        }
        case 'hook-surface': {
            const { auditHookSurface } = await import('#audit/hook-surface');
            const auditResult = auditHookSurface(input.cwd ?? input.directory);
            return {
                passed: auditResult.passed,
                summary: auditResult.passed
                    ? 'hook-surface audit passed'
                    : `hook-surface audit failed with ${auditResult.details.violations.length} violation${auditResult.details.violations.length === 1 ? '' : 's'}`,
                kind,
                details: {
                    ok: auditResult.details.ok,
                    violations: auditResult.details.violations.map((v) => ({
                        message: v.reason,
                    })),
                },
            };
        }
        case 'no-relative-package-scripts': {
            const { auditNoRelativePackageScripts } = await import('#audit/repo-guardrails');
            const auditResult = auditNoRelativePackageScripts(input.cwd ?? input.directory ?? process.cwd());
            return {
                passed: auditResult.ok,
                summary: auditResult.ok
                    ? 'no-relative-package-scripts passed'
                    : `no-relative-package-scripts failed: ${auditResult.violations.length} violation${auditResult.violations.length === 1 ? '' : 's'}`,
                kind,
                details: {
                    ok: auditResult.ok,
                    violations: auditResult.violations,
                },
            };
        }
        default: {
            // Exhaustiveness check — z.enum should make this unreachable.
            const _exhaustive = kind;
            return {
                passed: false,
                summary: 'audit dispatch hit unreachable case',
                kind: String(_exhaustive),
                details: 'unreachable',
            };
        }
    }
}
const tool = {
    name: 'wp_audit',
    description: 'Run a packaged repo audit. `kind` selects the audit (tph, tph-e2e, catalog-drift, docs-frontmatter, blueprint-lifecycle, architecture-drift, roadmap-links, bundle-budget, commit-message, tech-debt, hook-surface, package-surface, no-relative-package-scripts). Returns {passed, kind, details}.',
    inputSchema,
    outputSchema,
    annotations: {
        title: 'Audit',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
    handler: async (raw) => {
        let input;
        try {
            input = inputSchema.parse(raw ?? {});
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const kind = raw &&
                typeof raw === 'object' &&
                'kind' in raw &&
                typeof raw.kind === 'string'
                ? raw.kind
                : 'unknown';
            // Schema validation failure — agent supplied bad input; isError lets
            // it distinguish "audit ran and found issues" from "audit didn't run".
            return wrap({ passed: false, summary: `Invalid wp_audit input for ${kind}`, kind, details: message }, { isError: true });
        }
        try {
            const payload = await dispatch(input);
            return wrap(payload);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return wrap({
                passed: false,
                summary: `${input.kind} audit crashed`,
                kind: input.kind,
                details: message,
            }, { isError: true });
        }
    },
};
export default tool;
//# sourceMappingURL=audit.js.map