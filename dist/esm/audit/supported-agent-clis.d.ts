import type { RepoAuditResult, RepoAuditViolation } from "./repo-guardrails.js";
export declare const EXPECTED_CLI_IDS: readonly string[];
/**
 * Extracts CLI identifiers from the rule doc's tables. A table is recognised
 * only by a `| CLI | … |` header immediately followed by a `|---|` separator
 * row, so a header-shaped line in prose (or a decoy table without a separator)
 * is not harvested. Parses ONLY column 1 of each data row.
 */
export declare function parseDocCliIds(markdown: string): Set<string>;
/**
 * Bidirectional set comparison. `code-has-not-in-doc` catches a shipped CLI
 * missing from the rule doc; `doc-has-not-in-code` catches a CLI the doc lists
 * that the code does not model.
 */
export declare function compareCliIds(docIds: ReadonlySet<string>, expectedIds: readonly string[]): RepoAuditViolation[];
export declare function auditSupportedAgentClis(rootDirectory?: string): RepoAuditResult;
//# sourceMappingURL=supported-agent-clis.d.ts.map