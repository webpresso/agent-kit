/**
 * Canonical list of `wp_audit` kinds — single source of truth.
 *
 * Imported by the `wp_audit` MCP tool (for its `kind` enum + dispatch) and by
 * the pretool-guard (to validate repo `guard.scriptRoutes` targets and to
 * redirect `wp audit <kind>` CLI calls to the MCP tool). Kept as a tiny
 * dependency-free module so the hook runtime, which runs on every tool call,
 * doesn't pull in the whole audit tool graph.
 */
export declare const AUDIT_KINDS: readonly ["tph", "tph-e2e", "agents", "catalog-drift", "package-surface", "docs-frontmatter", "blueprint-readme-drift", "blueprint-lifecycle", "architecture-drift", "cloudflare-deploy-contract", "absolute-path-policy", "no-first-party-mjs", "roadmap-links", "bundle-budget", "commit-message", "tech-debt", "hook-surface", "ai-contracts", "no-relative-package-scripts", "toolchain-isolation"];
export type AuditKind = (typeof AUDIT_KINDS)[number];
export declare function isAuditKind(value: string): value is AuditKind;
//# sourceMappingURL=audit-kinds.d.ts.map