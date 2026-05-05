/**
 * @webpresso/agent-kit/blueprint/local - CLI-only exports
 *
 * These exports use Node.js APIs (fs, simple-git) and are NOT compatible with Cloudflare Workers.
 * For Workers-safe functions, use the main '@webpresso/agent-kit/blueprint' entry point.
 */
export type { FalseDependency, ParallelizeResult, TaskFiles, TaskPairAnalysis, } from './dag/local/independence.js';
export { createMockPackageGraph, IndependenceDetector } from './dag/local/independence.js';
export { createMockFileSystem, PackageGraph, realFileSystem } from './dag/local/package-graph.js';
export { type AcceptanceCriteria, type Blueprint, buildBlueprintProgressBridgeState, type BlueprintStatus, type BlueprintTaskStatus, checkAcceptanceCriteria, checkAllCheckboxes, checkChangelog, checkFirstCheckbox, complexitySchema, type CriteriaResult, extractTaskSection, formatDiffForDisplay, generateBlueprintDiff, isBlueprintStatus, isComplexity, isTaskStatus, lifecycleBlueprintStatusSchema, normalizeOmxTeamTaskSnapshot, type OmxTeamTaskSnapshot, type Phase, parseBlueprint, type PlanComplexity, type PlanFrontmatter, planStatusSchema, projectBlueprintLifecycleFromRuntime, resolveBlueprintProgressBridgePath, serializeBlueprint, type Task, taskStatusSchema, type TaskStatusValue, updateBlockedReason, updateTaskStatus, type ValidationResult, validateEmbeddedPhases, validatePlanLinks, validatePlanState, validatePlanTemplate, } from './index.js';
export { BlueprintCreationService, type BlueprintCreationServiceOptions, type BlueprintDraft, type CreateBlueprintInput, type CreatedBlueprint, } from './service/BlueprintCreationService.js';
export { type BlueprintQueryOptions, BlueprintService, type BlueprintSummary, } from './service/BlueprintService.js';
export { type ScannedBlueprint, type ScanOptions, scanBlueprintDirectory, } from './service/scanner.js';
export { runBlueprintAudit, type BlueprintAuditIssue, type BlueprintAuditResult, type RunBlueprintAuditOptions, } from './lifecycle/audit.js';
export { applyBlueprintLifecycle, type BlueprintLifecycleIntent, type BlueprintLifecycleResult, type LifecycleTaskStatus, } from './lifecycle/engine.js';
export { applyBlueprintLifecycleToFile, relativeBlueprintSlug, resolveBlueprintFile, type BlueprintLifecycleWriteResult, type ResolvedBlueprintFile, } from './lifecycle/local.js';
export { type TechDebtQueryOptions, TechDebtService, type TechDebtSummary, } from './service/TechDebtService.js';
export { archiveBlueprint, type ArchiveResult, type IncompleteTask, type ValidationResult as ArchiveValidationResult, validateAllTasksDone, } from './utils/archive.js';
export { type ConflictInfo, type ConflictResolution, ConflictResolver, createConflictResolver, type ResolvedConflict, } from './utils/conflict.js';
export { BlueprintNotFoundError } from './utils/errors.js';
//# sourceMappingURL=local.d.ts.map