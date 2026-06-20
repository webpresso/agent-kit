/**
 * `wp_audits` MCP tool.
 *
 * Batch wrapper around the existing `wp_audit` dispatcher. It is intentionally
 * read-only and deterministic: every resolved audit is attempted in order,
 * individual crashes are captured as failed result entries, and aggregate
 * `passed` is true only when every audit passes.
 */
import { z } from 'zod';
import type { ToolDescriptor } from '#mcp/auto-discover';
import { type MCPAuditKind } from './_shared/audit-kinds.js';
export declare function resolveGuardrailPresetKinds(root?: string): MCPAuditKind[];
declare const inputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    directory: z.ZodOptional<z.ZodString>;
    kinds: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        "no-relative-package-scripts": "no-relative-package-scripts";
        "reference-parity-matrix": "reference-parity-matrix";
        agents: "agents";
        "tech-debt": "tech-debt";
        "consumer-agent-kit-dependency": "consumer-agent-kit-dependency";
        "hook-surface": "hook-surface";
        "no-dev-vars": "no-dev-vars";
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
        "toolchain-isolation": "toolchain-isolation";
        "open-source-licenses": "open-source-licenses";
        "session-memory-hardcut": "session-memory-hardcut";
    }>>>;
    preset: z.ZodOptional<z.ZodEnum<{
        all: "all";
        guardrails: "guardrails";
    }>>;
    baseRef: z.ZodOptional<z.ZodString>;
    strict: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type AkAuditsInput = z.infer<typeof inputSchema>;
declare const outputSchema: z.ZodObject<{
    [x: string]: z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
    total: z.ZodNumber;
    passedCount: z.ZodNumber;
    failedCount: z.ZodNumber;
    failedKinds: z.ZodArray<z.ZodString>;
    results: z.ZodArray<z.ZodObject<{
        kind: z.ZodString;
        passed: z.ZodBoolean;
        summary: z.ZodString;
        details: z.ZodUnknown;
        isError: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type AuditBatchResult = z.infer<typeof outputSchema>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=audits.d.ts.map