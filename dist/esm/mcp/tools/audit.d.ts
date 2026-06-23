/**
 * `wp_audit` MCP tool.
 *
 * Wraps the existing `wp audit *` subcommands behind one MCP tool with a
 * `kind` enum. Returns a structured `{passed, kind, details}` payload wrapped
 * in MCP `text` content blocks.
 *
 * All kinds dispatch directly to the library functions exported from
 * `#audit/repo-guardrails`, `#audit/tech-debt`, `#audit/audit-tph-runner`,
 * `#audit/audit-tph-e2e-runner`, and `../../vite/local`.
 *
 * Audit failures (whether represented as `ok: false` from the library or
 * as a thrown error) are caught and returned as `{passed: false, ...}`
 * — the handler never throws out, so the MCP server stays responsive.
 */
import { z } from 'zod';
import type { ToolDescriptor } from '#mcp/auto-discover';
export declare const KINDS: readonly ["tph", "tph-e2e", "agents", "catalog-drift", "package-surface", "reference-parity-matrix", "docs-frontmatter", "blueprint-readme-drift", "blueprint-pr-coverage", "blueprint-lifecycle", "blueprint-trust", "architecture-drift", "cloudflare-deploy-contract", "absolute-path-policy", "no-first-party-mjs", "no-math-random", "roadmap-links", "bundle-budget", "commit-message", "tech-debt", "hook-surface", "harness-surfaces", "weakness-mining", "harness-overlay-evidence", "ai-contracts", "atomic-state-writes", "no-relative-package-scripts", "toolchain-isolation", "open-source-licenses", "secrets-policy", "no-dev-vars", "github-actions-secrets", "secret-provider-quarantine", "github-actions-secrets", "secrets-config", "consumer-agent-kit-dependency", "session-memory-hardcut"];
export declare const inputSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        "no-relative-package-scripts": "no-relative-package-scripts";
        "reference-parity-matrix": "reference-parity-matrix";
        agents: "agents";
        "tech-debt": "tech-debt";
        "consumer-agent-kit-dependency": "consumer-agent-kit-dependency";
        "github-actions-secrets": "github-actions-secrets";
        "hook-surface": "hook-surface";
        "no-dev-vars": "no-dev-vars";
        "no-math-random": "no-math-random";
        "secret-provider-quarantine": "secret-provider-quarantine";
        "secrets-config": "secrets-config";
        "secrets-policy": "secrets-policy";
        tph: "tph";
        "tph-e2e": "tph-e2e";
        "catalog-drift": "catalog-drift";
        "package-surface": "package-surface";
        "docs-frontmatter": "docs-frontmatter";
        "blueprint-readme-drift": "blueprint-readme-drift";
        "blueprint-pr-coverage": "blueprint-pr-coverage";
        "blueprint-lifecycle": "blueprint-lifecycle";
        "blueprint-trust": "blueprint-trust";
        "architecture-drift": "architecture-drift";
        "cloudflare-deploy-contract": "cloudflare-deploy-contract";
        "absolute-path-policy": "absolute-path-policy";
        "no-first-party-mjs": "no-first-party-mjs";
        "roadmap-links": "roadmap-links";
        "bundle-budget": "bundle-budget";
        "commit-message": "commit-message";
        "harness-surfaces": "harness-surfaces";
        "weakness-mining": "weakness-mining";
        "harness-overlay-evidence": "harness-overlay-evidence";
        "ai-contracts": "ai-contracts";
        "atomic-state-writes": "atomic-state-writes";
        "toolchain-isolation": "toolchain-isolation";
        "open-source-licenses": "open-source-licenses";
        "session-memory-hardcut": "session-memory-hardcut";
    }>;
    cwd: z.ZodOptional<z.ZodString>;
    directory: z.ZodOptional<z.ZodString>;
    messageFile: z.ZodOptional<z.ZodString>;
    baseRef: z.ZodOptional<z.ZodString>;
    strict: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type AkAuditInput = z.infer<typeof inputSchema>;
export interface RepoAuditLikeResult {
    ok: boolean;
    title?: string;
    checked?: number;
    violations?: {
        message: string;
        file?: string;
    }[];
}
export type AuditPayload = {
    passed: boolean;
    summary: string;
    kind: string;
    details: string | RepoAuditLikeResult | {
        exitCode: number;
    };
    rawOutput?: string;
    truncated?: true;
    logPath?: string;
};
export declare function wrapAuditPayload(payload: AuditPayload, options?: {
    isError?: boolean;
}): {
    isError?: boolean | undefined;
    content: {
        type: "text";
        text: string;
    }[];
    structuredContent: AuditPayload;
};
export declare function summarizeRepoAudit(kind: string, result: RepoAuditLikeResult): string;
export declare function dispatchAudit(input: AkAuditInput): Promise<AuditPayload>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=audit.d.ts.map