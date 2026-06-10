export const RUNTIME_LANE = 'runtime-required'
export const PHASE2_RUNTIME_LANE = 'phase2-runtime'
export const JS_HOLDBACK_LANE = 'js-bun-holdback'

export const RUNTIME_REQUIRED_WP_COMMANDS = ['mcp', 'hook']

export const RUNTIME_REQUIRED_HOOKS_SUBCOMMANDS = ['doctor', 'status', 'dispatch']

export const PHASE2_RUNTIME_WP_COMMANDS = [
  'doctor',
  'audit',
  'qa',
  'test',
  'e2e',
  'ci',
  'typecheck',
  'lint',
  'format',
  'err',
  'gain',
  'bench',
]

export const JS_HOLDBACK_WP_COMMANDS = [
  'setup',
  'init',
  'sync',
  'compile',
  'rule',
  'skill',
  'skills',
  'docs',
  'blueprint',
  'roadmap',
  'worktree',
  'config',
  'dev',
  'deploy',
  'tech-debt',
  'install',
  'add',
  'remove',
  'update',
  'exec',
  'run',
]

export const DIRECT_RUNTIME_BIN_ARGS = {
  'wp-pretool-guard': ['hook', 'pretool-guard'],
  'wp-post-tool': ['hook', 'post-tool'],
  'wp-stop-qa': ['hook', 'stop-qa'],
  'wp-guard-switch': ['hook', 'guard-switch'],
  'wp-sessionstart-routing': ['hook', 'sessionstart-routing'],
  'wp-test-quality-check': ['hook', 'test-quality-check'],
  'wp-check-dev-link': ['hook', 'check-dev-link'],
}

export const COMMAND_LANE_TABLE = {
  runtimeRequired: {
    wpCommands: RUNTIME_REQUIRED_WP_COMMANDS,
    hooksSubcommands: RUNTIME_REQUIRED_HOOKS_SUBCOMMANDS,
    directBins: Object.keys(DIRECT_RUNTIME_BIN_ARGS),
  },
  phase2Runtime: {
    wpCommands: PHASE2_RUNTIME_WP_COMMANDS,
  },
  jsBunHoldback: {
    wpCommands: JS_HOLDBACK_WP_COMMANDS,
  },
}

export function formatCommandLaneSummary(table = COMMAND_LANE_TABLE) {
  const labels = []
  if (table.runtimeRequired) labels.push(RUNTIME_LANE)
  if (table.phase2Runtime) labels.push(PHASE2_RUNTIME_LANE)
  if (table.jsBunHoldback) labels.push('JS/Bun holdback')
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)} lanes`
}

const HOOKS_OPTIONS_WITH_VALUE = new Set(['--hosts', '--host', '--vendor', '--tool'])

function normalizeCommand(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveHooksSubcommand(args) {
  const hooksArgs = args.slice(1)
  for (let index = 0; index < hooksArgs.length; index += 1) {
    const arg = hooksArgs[index]
    if (typeof arg !== 'string' || arg.length === 0) continue
    if (HOOKS_OPTIONS_WITH_VALUE.has(arg)) {
      index += 1
      continue
    }
    if (arg.startsWith('--')) continue
    return arg
  }
  return 'doctor'
}

export function getWpCommandLane(forwardedArgs = []) {
  const command = normalizeCommand(forwardedArgs[0])
  if (RUNTIME_REQUIRED_WP_COMMANDS.includes(command)) return RUNTIME_LANE
  if (command === 'hooks') {
    const subcommand = resolveHooksSubcommand(forwardedArgs)
    return RUNTIME_REQUIRED_HOOKS_SUBCOMMANDS.includes(subcommand) ? RUNTIME_LANE : JS_HOLDBACK_LANE
  }
  if (PHASE2_RUNTIME_WP_COMMANDS.includes(command)) return PHASE2_RUNTIME_LANE
  if (JS_HOLDBACK_WP_COMMANDS.includes(command)) return JS_HOLDBACK_LANE
  return JS_HOLDBACK_LANE
}

export function getDirectBinRuntimeArgs(binName) {
  return DIRECT_RUNTIME_BIN_ARGS[binName] ?? null
}

export function isRuntimeRequiredWpInvocation(forwardedArgs = []) {
  return getWpCommandLane(forwardedArgs) === RUNTIME_LANE
}

export function isMigratedRuntimeWpInvocation(forwardedArgs = []) {
  const lane = getWpCommandLane(forwardedArgs)
  return lane === RUNTIME_LANE || lane === PHASE2_RUNTIME_LANE
}

export function isRuntimeRequiredDirectBin(binName) {
  return Object.hasOwn(DIRECT_RUNTIME_BIN_ARGS, binName)
}
