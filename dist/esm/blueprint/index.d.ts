/**
 * @webpresso/agent-kit/blueprint - Implementation Plan Management
 *
 * Workers-safe exports (pure functions, types, no I/O)
 * For CLI features with git integration, use '@webpresso/agent-kit/blueprint/local'
 */
export type { AcceptanceCriteria, Blueprint, Phase, Task, TaskStatusValue } from './core/parser.js';
export { parseBlueprint, serializeBlueprint } from './core/parser.js';
export { type BlueprintStatus, type BlueprintTaskStatus, complexitySchema, lifecycleBlueprintStatusSchema, type PlanComplexity, type PlanFrontmatter, planFrontmatterSchema, planStatusSchema, taskStatusSchema, } from './core/schema.js';
export type { CriteriaResult, ValidationResult } from './core/types.js';
export { checkAcceptanceCriteria } from './core/validation/criteria.js';
export { checkChangelog, validatePlanLinks } from './core/validation/links.js';
export { validateEmbeddedPhases } from './core/validation/phases.js';
export { validatePlanState } from './core/validation/state.js';
export { validatePlanTemplate } from './core/validation/template.js';
export { type BlueprintDiff, type DiffChange, type DiffFieldChange, formatDiffForDisplay, generateBlueprintDiff, } from './history/diff.js';
export { checkAllCheckboxes, checkFirstCheckbox, extractCodeBlocks, extractTaskSection, updateBlockedReason, updateTaskStatus, } from './markdown/helpers.js';
export { applyBlueprintLifecycle, type BlueprintLifecycleIntent, type BlueprintLifecycleResult, type LifecycleTaskStatus, } from './lifecycle/engine.js';
export { type GraphEdge, type GraphEdgeType, type GraphLayout, type GraphNode, type GraphNodeType, type NormalizedGraph, parseMermaidToGraph, serializeGraphToMermaid, taskGraphToNormalizedGraph, } from './graph/index.js';
export type { BlueprintQueryFilters, BlueprintQueryResult, BlueprintQuerySummary, BlueprintRecord, BlueprintSortField, BlueprintSortOptions, Complexity, SortDirection, TaskStatus, } from './query/types.js';
export { isBlueprintStatus, isComplexity, isTaskStatus } from './query/types.js';
export { BlueprintNotFoundError } from './utils/errors.js';
export { calculateFreshness, type FreshnessScore } from './utils/freshness.js';
export { blueprintExecutionBackendSchema, type BlueprintExecutionAdapter, type BlueprintExecutionBackend, blueprintExecutionModeSchema, type BlueprintExecutionMode, blueprintExecutionPolicySchema, type BlueprintExecutionPolicy, blueprintExecutionSpecSchema, type BlueprintExecutionSpec, blueprintLaunchSpecSchema, type BlueprintLaunchSpec, blueprintTaskBackendHintsSchema, type BlueprintTaskBackendHints, blueprintTaskLaunchSpecSchema, type BlueprintTaskLaunchSpec, DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT, runtimeStateSnapshotSchema, type RuntimeStateSnapshot, runtimeStateStatusSchema, type RuntimeStateStatus, } from './execution/types.js';
export { clearBlueprintExecutionArtifacts, readBlueprintExecutionArtifacts, type BlueprintExecutionArtifacts, writeBlueprintExecutionArtifacts, } from './execution/artifacts.js';
export { clearBlueprintExecutionMetadata, readBlueprintExecutionMetadata, type BlueprintExecutionMetadata, writeBlueprintExecutionMetadata, } from './execution/metadata.js';
export { buildBlueprintProgressBridgeState, blueprintProgressBridgeStateSchema, blueprintProgressBridgeTaskBindingSchema, normalizeOmxTeamTaskSnapshot, type BlueprintProgressBridgeProjection, type BlueprintProgressBridgeState, type BlueprintProgressBridgeTaskBinding, type OmxTeamTaskSnapshot, omxTeamTaskSnapshotSchema, omxTeamTaskStatusSchema, projectBlueprintLifecycleFromRuntime, resolveBlueprintProgressBridgePath, sanitizeBlueprintExecutionId, } from './execution/progress-bridge.js';
export { applyRuntimeProgressSnapshot, runtimeSnapshotPathForExecution, type RuntimeProgressBridgeResult, } from './execution/progress-bridge.js';
export { buildRoadmapModel, type RoadmapLike, type RoadmapModel, type RoadmapNode, type RoadmapRollup, } from './roadmap.js';
//# sourceMappingURL=index.d.ts.map