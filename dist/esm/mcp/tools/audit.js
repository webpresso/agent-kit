/**
 * `ak_audit` MCP tool.
 *
 * Wraps the existing `ak audit *` subcommands behind one MCP tool with a
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
const KINDS = [
    'tph',
    'catalog-drift',
    'docs-frontmatter',
    'blueprint-lifecycle',
    'bundle-budget',
    'commit-message',
    'tech-debt',
];
const inputSchema = z.object({
    kind: z.enum(KINDS),
    directory: z.string().optional(),
    messageFile: z.string().optional(),
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
        child.stdout?.on('data', () => { });
        child.stderr?.on('data', () => { });
        child.on('error', () => resolve(1));
        child.on('close', (code) => resolve(code ?? 1));
    });
}
function wrap(payload) {
    return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
    };
}
async function dispatch(input) {
    const { kind } = input;
    switch (kind) {
        case 'catalog-drift': {
            const { auditCatalogDrift } = await import('#audit/repo-guardrails');
            const auditResult = auditCatalogDrift(input.directory ?? process.cwd());
            return { passed: auditResult.ok, kind, details: auditResult };
        }
        case 'docs-frontmatter': {
            const { auditDocsFrontmatter } = await import('#audit/repo-guardrails');
            const auditResult = auditDocsFrontmatter(input.directory ?? process.cwd());
            return { passed: auditResult.ok, kind, details: auditResult };
        }
        case 'blueprint-lifecycle': {
            const { auditBlueprintLifecycle } = await import('#audit/repo-guardrails');
            const auditResult = auditBlueprintLifecycle(input.directory ?? process.cwd());
            return { passed: auditResult.ok, kind, details: auditResult };
        }
        case 'commit-message': {
            const messageFile = input.messageFile ?? input.directory;
            if (!messageFile) {
                return {
                    passed: false,
                    kind,
                    details: 'commit-message requires a message file via `messageFile` or `directory`.',
                };
            }
            const { auditCommitMessageFile } = await import('#audit/repo-guardrails');
            const auditResult = auditCommitMessageFile(messageFile);
            return { passed: auditResult.ok, kind, details: auditResult };
        }
        case 'tech-debt': {
            const { auditTechDebt } = await import('#audit/tech-debt');
            const auditResult = auditTechDebt(input.directory ?? process.cwd());
            return { passed: auditResult.ok, kind, details: auditResult };
        }
        case 'bundle-budget': {
            const { runBundleBudgetCli } = await import('../../vite/local.js');
            const args = input.directory ? [input.directory] : [];
            const exitCode = await runBundleBudgetCli(args);
            return { passed: exitCode === 0, kind, details: { exitCode } };
        }
        case 'tph': {
            const script = resolveAuditScript('audit-tph.ts');
            const exitCode = await runScript(script);
            return { passed: exitCode === 0, kind, details: { exitCode } };
        }
        default: {
            // Exhaustiveness check — z.enum should make this unreachable.
            const _exhaustive = kind;
            return { passed: false, kind: String(_exhaustive), details: 'unreachable' };
        }
    }
}
const tool = {
    name: 'ak_audit',
    description: 'Run a packaged repo audit. `kind` selects the audit (tph, catalog-drift, docs-frontmatter, blueprint-lifecycle, bundle-budget, commit-message, tech-debt). Returns {passed, kind, details}.',
    inputSchema,
    handler: async (raw) => {
        let input;
        try {
            input = inputSchema.parse(raw ?? {});
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const kind = raw && typeof raw === 'object' && 'kind' in raw && typeof raw.kind === 'string'
                ? raw.kind
                : 'unknown';
            return wrap({ passed: false, kind, details: message });
        }
        try {
            const payload = await dispatch(input);
            return wrap(payload);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return wrap({ passed: false, kind: input.kind, details: message });
        }
    },
};
export default tool;
//# sourceMappingURL=audit.js.map