/**
 * @webpresso/agent-kit/blueprint/local - CLI-only exports
 *
 * These exports use Node.js APIs (fs, simple-git) and are NOT compatible with Cloudflare Workers.
 * For Workers-safe functions, use the main '@webpresso/agent-kit/blueprint' entry point.
 */

// DAG Local (Node.js-only utilities, re-exported for CLI convenience)
export type {
  FalseDependency,
  ParallelizeResult,
  TaskFiles,
  TaskPairAnalysis,
} from './dag/local/independence'
export { createMockPackageGraph, IndependenceDetector } from './dag/local/independence'
export { createMockFileSystem, PackageGraph, realFileSystem } from './dag/local/package-graph'

// Workers-safe exports for convenience (explicit re-export to avoid wildcard)
export {
  type AcceptanceCriteria,
  type Blueprint,
  buildBlueprintProgressBridgeState,
  type BlueprintStatus,
  type BlueprintTaskStatus,
  checkAcceptanceCriteria,
  checkAllCheckboxes,
  checkChangelog,
  checkFirstCheckbox,
  complexitySchema,
  type CriteriaResult,
  extractTaskSection,
  formatDiffForDisplay,
  generateBlueprintDiff,
  isBlueprintStatus,
  isComplexity,
  isTaskStatus,
  lifecycleBlueprintStatusSchema,
  normalizeOmxTeamTaskSnapshot,
  type OmxTeamTaskSnapshot,
  type Phase,
  parseBlueprint,
  type PlanComplexity,
  type PlanFrontmatter,
  planStatusSchema,
  projectBlueprintLifecycleFromRuntime,
  resolveBlueprintProgressBridgePath,
  serializeBlueprint,
  type Task,
  taskStatusSchema,
  type TaskStatusValue,
  updateBlockedReason,
  updateTaskStatus,
  type ValidationResult,
  validateEmbeddedPhases,
  validatePlanLinks,
  validatePlanState,
  validatePlanTemplate,
} from './index'

// Services (require filesystem/git)
export {
  BlueprintCreationService,
  type BlueprintCreationServiceOptions,
  type BlueprintDraft,
  type CreateBlueprintInput,
  type CreatedBlueprint,
} from './service/BlueprintCreationService'
export {
  type BlueprintQueryOptions,
  BlueprintService,
  type BlueprintSummary,
} from './service/BlueprintService'
export { type ScannedBlueprint, type ScanOptions, scanBlueprintDirectory } from './service/scanner'
export {
  runBlueprintAudit,
  type BlueprintAuditIssue,
  type BlueprintAuditResult,
  type RunBlueprintAuditOptions,
} from './lifecycle/audit'
export {
  applyBlueprintLifecycle,
  type BlueprintLifecycleIntent,
  type BlueprintLifecycleResult,
  type LifecycleTaskStatus,
} from './lifecycle/engine'
export {
  applyBlueprintLifecycleToFile,
  relativeBlueprintSlug,
  resolveBlueprintFile,
  type BlueprintLifecycleWriteResult,
  type ResolvedBlueprintFile,
} from './lifecycle/local'
export {
  type TechDebtQueryOptions,
  TechDebtService,
  type TechDebtSummary,
} from './service/TechDebtService'

// Archive (requires git)
export {
  archiveBlueprint,
  type ArchiveResult,
  type IncompleteTask,
  type ValidationResult as ArchiveValidationResult,
  validateAllTasksDone,
} from './utils/archive'

// Conflict Resolution
export {
  type ConflictInfo,
  type ConflictResolution,
  ConflictResolver,
  createConflictResolver,
  type ResolvedConflict,
} from './utils/conflict'

// Error Types
export { BlueprintNotFoundError } from './utils/errors'
