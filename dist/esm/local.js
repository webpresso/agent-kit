/**
 * @webpresso/agent-kit/local — Node-only public API.
 *
 * Services, filesystem I/O, git integration, symlinker, docs-linter.
 * Not Worker-safe. For pure functions, import from '@webpresso/agent-kit'.
 *
 * Populated in Phase 1.
 */
export { auditBlueprintLifecycle, auditCatalogDrift, auditCommitMessageFile, auditDocsFrontmatter, formatRepoAuditReport, validateCommitMessage, } from './audit/repo-guardrails.js';
export { analyzeViteDistBundleBudget, bundleBudgetCliHelp, parseBundleBudgetCliArgs, runBundleBudgetCli, } from './vite/local.js';
//# sourceMappingURL=local.js.map