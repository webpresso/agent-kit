/**
 * MCP/pretool-supported `wp_audit` kinds.
 *
 * Imported by the `wp_audit` MCP tool (for its `kind` enum + dispatch) and by
 * the pretool-guard (to validate repo `guard.scriptRoutes` targets and to
 * redirect MCP-ready `wp audit <kind>` CLI calls to the MCP tool).
 *
 * This is intentionally narrower than the full CLI `AuditKind` union: some CLI
 * audits are script aggregators or local-only checks that are not exposed as MCP
 * tools. Keep this module dependency-free so the hook runtime, which runs on
 * every tool call, doesn't pull in the whole audit tool graph.
 */
export const MCP_AUDIT_KINDS = [
    'tph',
    'tph-e2e',
    'agents',
    'catalog-drift',
    'package-surface',
    'reference-parity-matrix',
    'docs-frontmatter',
    'blueprint-readme-drift',
    'blueprint-pr-coverage',
    'blueprint-lifecycle',
    'architecture-drift',
    'cloudflare-deploy-contract',
    'absolute-path-policy',
    'no-first-party-mjs',
    'roadmap-links',
    'bundle-budget',
    'commit-message',
    'tech-debt',
    'hook-surface',
    'harness-surfaces',
    'weakness-mining',
    'harness-overlay-evidence',
    'ai-contracts',
    'no-relative-package-scripts',
    'toolchain-isolation',
    'open-source-licenses',
    'secrets-policy',
    'no-dev-vars',
    'secret-provider-quarantine',
    'secrets-config',
    'consumer-agent-kit-dependency',
    'session-memory-hardcut',
];
export function isMCPAuditKind(value) {
    return MCP_AUDIT_KINDS.includes(value);
}
//# sourceMappingURL=audit-kinds.js.map