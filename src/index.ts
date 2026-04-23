/**
 * @webpresso/agent-kit — runtime-safe public API.
 *
 * Pure functions, types, and schemas with no filesystem or git I/O.
 * For Node-only features (services, symlinker, CLI), import from
 * '@webpresso/agent-kit/local'.
 *
 * Populated in Phase 1.
 */

export type __AgentKitEntrypointReserved = never

export {
  analyzeBundleBudget,
  extractHtmlEagerJsReferences,
  formatBundleBudgetReport,
  formatBytes,
  installChunkLoadRecovery,
} from './vite/index.js'
export type {
  AnalyzeBundleBudgetOptions,
  BundleBudgetAsset,
  BundleBudgetLimits,
  BundleBudgetResult,
  BundleBudgetViolation,
  BundleBudgetViolationKind,
  ChunkLoadRecoveryEvent,
  ChunkLoadRecoveryStorage,
  ChunkLoadRecoveryTarget,
  InstallChunkLoadRecoveryOptions,
} from './vite/index.js'
