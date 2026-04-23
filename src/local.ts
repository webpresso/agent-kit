/**
 * @webpresso/agent-kit/local — Node-only public API.
 *
 * Services, filesystem I/O, git integration, symlinker, docs-linter.
 * Not Worker-safe. For pure functions, import from '@webpresso/agent-kit'.
 *
 * Populated in Phase 1.
 */

export type __AgentKitLocalEntrypointReserved = never

export {
  analyzeViteDistBundleBudget,
  bundleBudgetCliHelp,
  parseBundleBudgetCliArgs,
  runBundleBudgetCli,
} from './vite/local.js'
export type { AnalyzeViteDistBundleBudgetOptions, BundleBudgetCliOptions } from './vite/local.js'
