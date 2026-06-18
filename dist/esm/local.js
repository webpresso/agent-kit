/**
 * webpresso/local — Node-only public API.
 *
 * Services, filesystem I/O, git integration, symlinker, docs-linter.
 * Not Worker-safe. For pure functions, import from '@webpresso/agent-kit'.
 *
 * Populated in Phase 1.
 */
export { buildRuntimeProcessEnv, buildRuntimeSpawnOptions, createRuntimeEnvCache, resolveRuntimeEnvironment, spawnRuntimeCommand, spawnRuntimeCommandSync, } from './runtime/index.js';
export { auditAiContracts } from './audit/ai-contracts.js';
export { auditBlueprintLifecycle, auditCatalogDrift, auditCommitMessageFile, auditDocsFrontmatter, formatRepoAuditReport, validateCommitMessage, } from './audit/repo-guardrails.js';
export { auditVision } from './audit/vision-doc.js';
export { analyzeViteDistBundleBudget, bundleBudgetCliHelp, parseBundleBudgetCliArgs, runBundleBudgetCli, } from './vite/local.js';
export { buildSecretGateCommand, runSecretGateCommand } from './secret-gate/runner.js';
//# sourceMappingURL=local.js.map