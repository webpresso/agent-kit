/**
 * webpresso/blueprint/local - CLI-only exports
 *
 * These exports use Node.js APIs (fs, simple-git) and are NOT compatible with Cloudflare Workers.
 * For Workers-safe functions, use the main 'webpresso/blueprint' entry point.
 */
// Workers-safe exports for convenience (explicit re-export to avoid wildcard)
export { buildRoadmapModel, buildBlueprintProgressBridgeState, checkAcceptanceCriteria, checkAllCheckboxes, checkChangelog, checkFirstCheckbox, complexitySchema, extractTaskSection, formatDiffForDisplay, generateBlueprintDiff, isBlueprintStatus, isComplexity, isTaskStatus, lifecycleBlueprintStatusSchema, normalizeOmxTeamTaskSnapshot, parseBlueprint, planStatusSchema, projectBlueprintLifecycleFromRuntime, resolveBlueprintProgressBridgePath, serializeBlueprint, taskStatusSchema, updateBlockedReason, updateTaskStatus, validateEmbeddedPhases, validatePlanLinks, validatePlanState, validatePlanTemplate, } from './index.js';
export { validateBlueprintTrust, } from './trust/validator.js';
// Services (require filesystem/git)
export { BlueprintCreationService, } from './service/BlueprintCreationService.js';
export { BlueprintService, } from './service/BlueprintService.js';
export { scanBlueprintDirectory, } from './service/scanner.js';
export { runBlueprintAudit, } from './lifecycle/audit.js';
export { applyBlueprintLifecycle, } from './lifecycle/engine.js';
export { applyBlueprintLifecycleToFile, relativeBlueprintSlug, resolveBlueprintFile, } from './lifecycle/local.js';
export { TechDebtService, } from './service/TechDebtService.js';
// Archive (requires git)
export { archiveBlueprint, validateAllTasksDone, } from './utils/archive.js';
// Conflict Resolution
export { ConflictResolver, createConflictResolver, } from './utils/conflict.js';
// Error Types
export { BlueprintNotFoundError } from './utils/errors.js';
//# sourceMappingURL=local.js.map