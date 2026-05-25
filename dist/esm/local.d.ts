/**
 * webpresso/local — Node-only public API.
 *
 * Services, filesystem I/O, git integration, symlinker, docs-linter.
 * Not Worker-safe. For pure functions, import from 'webpresso'.
 *
 * Populated in Phase 1.
 */
export type __WebpressoLocalEntrypointReserved = never;
export { auditBlueprintLifecycle, auditCatalogDrift, auditCommitMessageFile, auditDocsFrontmatter, formatRepoAuditReport, validateCommitMessage, } from './audit/repo-guardrails.js';
export type { BlueprintLifecycleOptions, CatalogDriftOptions, CommitMessageOptions, DocsFrontmatterOptions, RepoAuditResult, RepoAuditViolation, } from './audit/repo-guardrails.js';
export { auditVision } from './audit/vision-doc.js';
export type { VisionOptions, VisionRequiredSection } from './audit/vision-doc.js';
export { analyzeViteDistBundleBudget, bundleBudgetCliHelp, parseBundleBudgetCliArgs, runBundleBudgetCli, } from './vite/local.js';
export type { AnalyzeViteDistBundleBudgetOptions, BundleBudgetCliOptions } from './vite/local.js';
export { getCiActSecretProfile, injectDefaultActArgs, isCiActSecretProfileId, listMissingRequiredSecrets, normalizeActSecretsWithOptions, pickAllowedSecrets, renderSecretsFile, resolveCiActSecretProfile, writeTempSecretsFile, } from './ci/act-helper.js';
export type { CiActSecretProfile, CiActSecretProfileId, ResolveCiActSecretProfileOptions, TempSecretsFile, } from './ci/act-helper.js';
export { buildSecretGateCommand, runSecretGateCommand } from './secret-gate/runner.js';
export type { SecretGateCommand, SecretGateCommandOptions, SecretGateRunResult, } from './secret-gate/runner.js';
//# sourceMappingURL=local.d.ts.map