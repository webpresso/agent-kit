/**
 * webpresso/blueprint - Implementation Plan Management
 *
 * Workers-safe exports (pure functions, types, no I/O)
 * For CLI features with git integration, use 'webpresso/blueprint/local'
 */

// Core parsing and types
export type { AcceptanceCriteria, Blueprint, Phase, Task, TaskStatusValue } from './core/parser.js'
export { parseBlueprint, serializeBlueprint } from './core/parser.js'

// Schema validation
export {
  type BlueprintStatus,
  type BlueprintTaskStatus,
  complexitySchema,
  lifecycleBlueprintStatusSchema,
  type PlanComplexity,
  type PlanFrontmatter,
  planFrontmatterSchema,
  planStatusSchema,
  taskStatusSchema,
} from './core/schema.js'

// Core types
export type { CriteriaResult, ValidationResult } from './core/types.js'
// Validation (pure functions)
export { checkAcceptanceCriteria } from './core/validation/criteria.js'
export { checkChangelog, validatePlanLinks } from './core/validation/links.js'
export { validateEmbeddedPhases } from './core/validation/phases.js'
export { validatePlanState } from './core/validation/state.js'
export { validatePlanTemplate } from './core/validation/template.js'
export {
  type BlueprintDiff,
  type DiffChange,
  type DiffFieldChange,
  formatDiffForDisplay,
  generateBlueprintDiff,
} from './history/diff.js'
// Markdown helpers (pure functions)
export {
  checkAllCheckboxes,
  checkFirstCheckbox,
  extractCodeBlocks,
  extractTaskSection,
  updateBlockedReason,
  updateTaskStatus,
} from './markdown/helpers.js'
export {
  applyBlueprintLifecycle,
  type BlueprintLifecycleIntent,
  type BlueprintLifecycleResult,
  type LifecycleTaskStatus,
} from './lifecycle/engine.js'
// Query types
export type {
  BlueprintQueryFilters,
  BlueprintQueryResult,
  BlueprintQuerySummary,
  BlueprintRecord,
  BlueprintSortField,
  BlueprintSortOptions,
  Complexity,
  SortDirection,
  TaskStatus,
} from './query/types.js'
export { isBlueprintStatus, isComplexity, isTaskStatus } from './query/types.js'
export { BlueprintNotFoundError } from './utils/errors.js'
// Evidence Contract (F10) — pin per-kind evidence rules at zod parse time.
export {
  canonicalizeEvidence,
  canonicalizeEvidenceList,
  type Evidence,
  type EvidenceKind,
  type EvidenceList,
  evidenceListSchema,
  evidenceSchema,
} from './evidence.js'
// Verification block markdown helper (consumed by wp_blueprint_task_verify).
export {
  applyVerification,
  assertAllTasksHaveCanonicalPassingEvidence,
  assertTaskHasCanonicalPassingEvidence,
  parseVerificationBlock,
  readTaskVerification,
  serializeVerificationBlock,
  VERIFICATION_BLOCK_HEADER,
  type VerificationFailure,
  type VerificationResult,
  type VerificationSuccess,
  writeVerification,
  type WriteVerificationOptions,
} from './verification.js'
// Utilities (pure functions)
export { calculateFreshness, type FreshnessScore } from './utils/freshness.js'
export {
  type BlueprintDerivedHandoff,
  type BlueprintDerivedHandoffCodexGoal,
  blueprintDerivedHandoffCodexGoalSchema,
  type BlueprintDerivedHandoffOmxContext,
  blueprintDerivedHandoffOmxContextSchema,
  blueprintDerivedHandoffSchema,
  executionBackendSchema,
  type BlueprintExecutionAdapter,
  type BlueprintExecutionBackend,
  blueprintExecutionModeSchema,
  type BlueprintExecutionMode,
  blueprintExecutionPolicySchema,
  type BlueprintExecutionPolicy,
  blueprintExecutionSpecSchema,
  type BlueprintExecutionSpec,
  blueprintLaunchSpecSchema,
  type BlueprintLaunchSpec,
  blueprintTaskBackendHintsSchema,
  type BlueprintTaskBackendHints,
  blueprintTaskLaunchSpecSchema,
  type BlueprintTaskLaunchSpec,
  DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
  runtimeStateSnapshotSchema,
  type RuntimeStateSnapshot,
  runtimeStateStatusSchema,
  type RuntimeStateStatus,
} from './execution/types.js'
export {
  clearBlueprintExecutionArtifacts,
  readBlueprintExecutionArtifacts,
  type BlueprintExecutionArtifacts,
  writeBlueprintExecutionArtifacts,
} from './execution/artifacts.js'
export {
  clearBlueprintExecutionMetadata,
  readBlueprintExecutionMetadata,
  type BlueprintExecutionMetadata,
  writeBlueprintExecutionMetadata,
} from './execution/metadata.js'
export {
  buildBlueprintProgressBridgeState,
  blueprintProgressBridgeStateSchema,
  blueprintProgressBridgeTaskBindingSchema,
  normalizeOmxTeamTaskSnapshot,
  type BlueprintProgressBridgeProjection,
  type BlueprintProgressBridgeState,
  type BlueprintProgressBridgeTaskBinding,
  type OmxTeamTaskSnapshot,
  omxTeamTaskSnapshotSchema,
  omxTeamTaskStatusSchema,
  projectBlueprintLifecycleFromRuntime,
  resolveBlueprintProgressBridgePath,
  sanitizeBlueprintExecutionId,
} from './execution/progress-bridge.js'
export {
  applyRuntimeProgressSnapshot,
  runtimeSnapshotPathForExecution,
  type RuntimeProgressBridgeResult,
} from './execution/progress-bridge.js'
export {
  buildRoadmapModel,
  type RoadmapLike,
  type RoadmapModel,
  type RoadmapNode,
  type RoadmapRollup,
} from './roadmap.js'
// Context chunk assembler (consumed by wp_blueprint_context, Task 1.3).
export {
  assembleBlueprintContext,
  type AssembleContextInput,
  type ContextChunk,
  type ContextChunkKind,
  type ContextResult,
  type ContextScope,
  CONTEXT_CHUNK_MAX_BYTES,
  TASK_DEP_CONE_LIMIT,
  VERIFICATION_RECENT_LIMIT,
} from './context.js'
// HEAD-pinned freshness for projection DB (Task 1.3 + F11).
export {
  type BlueprintProjectLike,
  checkFreshness,
  type FreshnessResult,
  type ProjectionMetadata,
  readProjectionMetadata,
  recordProjectionMetadata,
  type RecordProjectionMetadataInput,
} from './freshness.js'
// NextAction discriminated union (F18).
export {
  isNextAction,
  makeNextAction,
  type NextAction,
  type NextActionKind,
  NEXT_ACTION_KINDS,
} from './next-action.js'
// Project/worktree resolver (Task 1.2).
export {
  type BlueprintProjectRef,
  type GitProbe,
  PROJECT_SOURCES,
  type ProjectSource,
  projectIdV1,
  RECURSIVE_SCAN_IGNORED_DIRS,
  type RecursiveScanLimits,
  RECURSIVE_SCAN_LIMITS,
  resolveBlueprintProjects,
  type ResolveBlueprintProjectsOptions,
  type RootsProvider,
  type RootsResponse,
} from './projects.js'
// Read-only aggregate helpers across selected projects (Task 3.1).
export {
  type AggregateBlueprintRowsOptions,
  type AggregateFailure,
  type AggregateResult,
  aggregateBlueprintRows,
  type ProjectReader,
  type ProjectReaderContext,
  READ_TARGET_SCOPES,
  type ReadTarget,
  type ReadTargetScope,
  readTargetSchema,
  type TaggedRow,
} from './aggregate.js'
