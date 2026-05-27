/**
 * webpresso/blueprint - Implementation Plan Management
 *
 * Workers-safe exports (pure functions, types, no I/O)
 * For CLI features with git integration, use 'webpresso/blueprint/local'
 */
export { parseBlueprint, serializeBlueprint } from './core/parser.js';
// Schema validation
export { complexitySchema, lifecycleBlueprintStatusSchema, planFrontmatterSchema, planStatusSchema, taskStatusSchema, } from './core/schema.js';
// Validation (pure functions)
export { checkAcceptanceCriteria } from './core/validation/criteria.js';
export { checkChangelog, validatePlanLinks } from './core/validation/links.js';
export { validateEmbeddedPhases } from './core/validation/phases.js';
export { validatePlanState } from './core/validation/state.js';
export { validatePlanTemplate } from './core/validation/template.js';
export { formatDiffForDisplay, generateBlueprintDiff, } from './history/diff.js';
// Markdown helpers (pure functions)
export { checkAllCheckboxes, checkFirstCheckbox, extractCodeBlocks, extractTaskSection, updateBlockedReason, updateTaskStatus, } from './markdown/helpers.js';
export { applyBlueprintLifecycle, } from './lifecycle/engine.js';
// Graph model + Mermaid integration
export { parseMermaidToGraph, serializeGraphToMermaid, taskGraphToNormalizedGraph, } from './graph/index.js';
export { isBlueprintStatus, isComplexity, isTaskStatus } from './query/types.js';
export { BlueprintNotFoundError } from './utils/errors.js';
// Evidence Contract (F10) — pin per-kind evidence rules at zod parse time.
export { canonicalizeEvidence, canonicalizeEvidenceList, evidenceListSchema, evidenceSchema, } from './evidence.js';
// Verification block markdown helper (consumed by wp_blueprint_task_verify).
export { applyVerification, parseVerificationBlock, serializeVerificationBlock, VERIFICATION_BLOCK_HEADER, writeVerification, } from './verification.js';
// Utilities (pure functions)
export { calculateFreshness } from './utils/freshness.js';
export { executionBackendSchema, blueprintExecutionModeSchema, blueprintExecutionPolicySchema, blueprintExecutionSpecSchema, blueprintLaunchSpecSchema, blueprintTaskBackendHintsSchema, blueprintTaskLaunchSpecSchema, DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT, runtimeStateSnapshotSchema, runtimeStateStatusSchema, } from './execution/types.js';
export { clearBlueprintExecutionArtifacts, readBlueprintExecutionArtifacts, writeBlueprintExecutionArtifacts, } from './execution/artifacts.js';
export { clearBlueprintExecutionMetadata, readBlueprintExecutionMetadata, writeBlueprintExecutionMetadata, } from './execution/metadata.js';
export { buildBlueprintProgressBridgeState, blueprintProgressBridgeStateSchema, blueprintProgressBridgeTaskBindingSchema, normalizeOmxTeamTaskSnapshot, omxTeamTaskSnapshotSchema, omxTeamTaskStatusSchema, projectBlueprintLifecycleFromRuntime, resolveBlueprintProgressBridgePath, sanitizeBlueprintExecutionId, } from './execution/progress-bridge.js';
export { applyRuntimeProgressSnapshot, runtimeSnapshotPathForExecution, } from './execution/progress-bridge.js';
export { buildRoadmapModel, } from './roadmap.js';
// Context chunk assembler (consumed by wp_blueprint_context, Task 1.3).
export { assembleBlueprintContext, CONTEXT_CHUNK_MAX_BYTES, TASK_DEP_CONE_LIMIT, VERIFICATION_RECENT_LIMIT, } from './context.js';
// HEAD-pinned freshness for projection DB (Task 1.3 + F11).
export { checkFreshness, readProjectionMetadata, recordProjectionMetadata, } from './freshness.js';
// NextAction discriminated union (F18).
export { isNextAction, makeNextAction, NEXT_ACTION_KINDS, } from './next-action.js';
// Project/worktree resolver (Task 1.2).
export { PROJECT_SOURCES, projectIdV1, RECURSIVE_SCAN_IGNORED_DIRS, RECURSIVE_SCAN_LIMITS, resolveBlueprintProjects, } from './projects.js';
// Read-only aggregate helpers across selected projects (Task 3.1).
export { aggregateBlueprintRows, READ_TARGET_SCOPES, readTargetSchema, } from './aggregate.js';
//# sourceMappingURL=index.js.map