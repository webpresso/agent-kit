export {
  buildTestCommand,
  buildVitestCommand,
  buildVpTestCommand,
  getVpTestTask,
  type CommandConfig,
  type TestCommandOptions,
  type VpRunLogMode,
} from './command-builder.js'
export {
  looksLikeTestFilePath,
  resolveTestTarget,
  type ResolvedTestTarget,
  type TestTargetInput,
  type TestTargetType,
} from './target-resolver.js'
