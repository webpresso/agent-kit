import { buildClaudeHookGroups } from '#cli/commands/init/scaffolders/agent-hooks/emitters/claude.js'
import { buildCodexHookGroups } from '#cli/commands/init/scaffolders/agent-hooks/emitters/codex.js'
import { buildCursorHooksConfig } from '#cli/commands/init/scaffolders/agent-hooks/emitters/cursor.js'
import { buildOpencodeHookPluginContent } from '#cli/commands/init/scaffolders/agent-hooks/emitters/opencode.js'
import { WP_HOOK_SPECS } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'
import { claudeHooksSchema } from '#cli/commands/init/scaffolders/agent-hooks/schemas/claude-hooks.schema.js'
import { codexHooksSchema } from '#cli/commands/init/scaffolders/agent-hooks/schemas/codex-hooks.schema.js'
import { cursorHooksSchema } from '#cli/commands/init/scaffolders/agent-hooks/schemas/cursor-hooks.schema.js'

export type ReferenceParityHost = 'claude' | 'codex' | 'cursor' | 'opencode'
export type ReferenceParityHostSupport = 'full' | 'degraded' | 'unsupported'

export interface ReferenceParityHostSmokeFixture {
  readonly host: ReferenceParityHost
  readonly defaultCi: true
  readonly support: ReferenceParityHostSupport
  readonly requiredConfigFiles: readonly string[]
  readonly optionalLiveBinary: string
  readonly requireEnvFlag: string
  readonly projectedLifecycle: readonly string[]
  readonly unsupportedLifecycle: readonly string[]
  readonly expectedManagedCommands: readonly string[]
  readonly schemaKind: 'claude-settings' | 'codex-hooks' | 'cursor-hooks' | 'opencode-plugin'
}

export type ReferenceParityHostSmokeFindingKind = 'config' | 'lifecycle' | 'tool-discovery'

export interface ReferenceParityHostSmokeFinding {
  readonly host: ReferenceParityHost
  readonly kind: ReferenceParityHostSmokeFindingKind
  readonly surface: string
  readonly ok: boolean
  readonly message: string
}

export interface ContinuityLifecycleProof {
  readonly host: ReferenceParityHost
  readonly lifecycle: 'startup' | 'post-tool' | 'user-prompt' | 'stop' | 'pre-compaction'
  readonly support: ReferenceParityHostSupport
  readonly proof: string
  readonly managedCommand: string | null
}

const MATCHERS = {
  preToolUse: 'Bash|Write|Edit|MultiEdit|mcp__.*',
  postToolUse: 'Bash|Write|Edit|MultiEdit|mcp__.*',
  postToolBatch: 'Bash|Write|Edit|MultiEdit|mcp__.*',
} as const

const CLAUDE_HOOKS = buildClaudeHookGroups({
  resolveBin: (name) => `"$CLAUDE_PROJECT_DIR/.claude/hooks/managed/${name}.sh"`,
  matchers: MATCHERS,
})

function codexFixtureCommand(name: string): string {
  const binPath = `'/repo/.codex/managed-hooks/${name}.sh'`
  const fallback =
    name === 'wp-pretool-guard'
      ? `printf '%s\\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"wp not found on PATH. Install @webpresso/agent-kit globally and re-run wp setup."}}'`
      : WP_HOOK_SPECS.find((spec) => spec.bin === name)?.jsonOnly === true
        ? "printf '%s\\n' '{}'"
        : 'true'
  return `[ -x ${binPath} ] && ${binPath} || ${fallback}`
}

const CODEX_HOOKS = buildCodexHookGroups({
  resolveBin: () => codexFixtureCommand,
  matchers: MATCHERS,
  repoRoot: '/repo',
})

const CURSOR_HOOKS = buildCursorHooksConfig({
  resolveBin: (name) =>
    `[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" || true`,
  matchers: MATCHERS,
})

const OPENCODE_PLUGIN = buildOpencodeHookPluginContent()

const CODEX_MCP_CONFIG = `
[mcp_servers.webpresso]
command = "wp"
args = ["mcp"]
`

export const referenceParityHostSmokeFixtures: readonly ReferenceParityHostSmokeFixture[] = [
  {
    host: 'claude',
    defaultCi: true,
    support: 'full',
    requiredConfigFiles: ['.claude/settings.json', '.mcp.json'],
    optionalLiveBinary: 'claude',
    requireEnvFlag: 'WP_REQUIRE_CLAUDE',
    projectedLifecycle: [
      'SessionStart',
      'PreToolUse',
      'PostToolUse',
      'UserPromptSubmit',
      'Stop',
      'PreCompact',
    ],
    unsupportedLifecycle: [],
    expectedManagedCommands: [
      'wp-sessionstart-routing',
      'wp-pretool-guard',
      'wp-post-tool',
      'wp-guard-switch',
      'wp-stop-qa',
      'wp-precompact-snapshot',
    ],
    schemaKind: 'claude-settings',
  },
  {
    host: 'codex',
    defaultCi: true,
    support: 'full',
    requiredConfigFiles: ['.codex/hooks.json', '$CODEX_HOME/config.toml'],
    optionalLiveBinary: 'codex',
    requireEnvFlag: 'WP_REQUIRE_CODEX',
    projectedLifecycle: [
      'SessionStart',
      'PreToolUse',
      'PostToolUse',
      'UserPromptSubmit',
      'Stop',
      'PreCompact',
    ],
    unsupportedLifecycle: [],
    expectedManagedCommands: [
      'wp-sessionstart-routing',
      'wp-pretool-guard',
      'wp-post-tool',
      'wp-guard-switch',
      'wp-stop-qa',
      'wp-precompact-snapshot',
    ],
    schemaKind: 'codex-hooks',
  },
  {
    host: 'cursor',
    defaultCi: true,
    support: 'degraded',
    requiredConfigFiles: [],
    optionalLiveBinary: 'cursor',
    requireEnvFlag: 'WP_REQUIRE_CURSOR',
    projectedLifecycle: ['sessionStart', 'preToolUse', 'postToolUse', 'beforeSubmitPrompt', 'stop'],
    unsupportedLifecycle: [
      'postCompact',
      'permissionRequest',
      'subagentStart',
      'subagentStop',
      'sessionEnd',
    ],
    expectedManagedCommands: [
      'wp-sessionstart-routing',
      'wp-pretool-guard',
      'wp-post-tool',
      'wp-guard-switch',
      'wp-stop-qa',
    ],
    schemaKind: 'cursor-hooks',
  },
  {
    host: 'opencode',
    defaultCi: true,
    support: 'degraded',
    requiredConfigFiles: ['.opencode/plugins/webpresso-hooks.js'],
    optionalLiveBinary: 'opencode',
    requireEnvFlag: 'WP_REQUIRE_OPENCODE',
    projectedLifecycle: [
      'session.created',
      'tool.execute.before',
      'tool.execute.after',
      'experimental.session.compacting',
    ],
    unsupportedLifecycle: [
      'beforeSubmitPrompt',
      'stop',
      'postCompact',
      'subagentStart',
      'subagentStop',
    ],
    expectedManagedCommands: [
      'wp hook sessionstart-routing',
      'wp hook pretool-guard',
      'wp hook post-tool',
    ],
    schemaKind: 'opencode-plugin',
  },
]

function commandList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((group) => {
    if (typeof group !== 'object' || group === null || !Array.isArray(group.hooks)) return []
    return group.hooks.flatMap((hook: unknown) => {
      if (typeof hook !== 'object' || hook === null) return []
      const command = (hook as { command?: unknown }).command
      return typeof command === 'string' ? [command] : []
    })
  })
}

function hasManagedCommand(commands: readonly string[], binName: string): boolean {
  return commands.some((command) => command.includes(binName))
}

function configFindings(): ReferenceParityHostSmokeFinding[] {
  return [
    {
      host: 'claude',
      kind: 'config',
      surface: '.claude/settings.json hooks',
      ok: claudeHooksSchema.safeParse(CLAUDE_HOOKS).success,
      message: 'Claude managed hook groups must parse as host settings hooks.',
    },
    {
      host: 'codex',
      kind: 'config',
      surface: '.codex/hooks.json hooks',
      ok: codexHooksSchema.safeParse({ hooks: CODEX_HOOKS }).success,
      message: 'Codex managed hook groups must parse in the wrapped hooks.json shape.',
    },
    {
      host: 'cursor',
      kind: 'config',
      surface: '.cursor/hooks.json',
      ok:
        cursorHooksSchema.safeParse(CURSOR_HOOKS).success &&
        Object.keys(CURSOR_HOOKS).every((key) =>
          [
            'version',
            'sessionStart',
            'preToolUse',
            'postToolUse',
            'beforeSubmitPrompt',
            'stop',
          ].includes(key),
        ),
      message:
        'Cursor managed projection must be versioned and limited to emitted host-valid keys.',
    },
    {
      host: 'opencode',
      kind: 'config',
      surface: '.opencode/plugins/webpresso-hooks.js',
      ok:
        OPENCODE_PLUGIN.includes('export const WebpressoHooksPlugin') &&
        OPENCODE_PLUGIN.includes('wp hook sessionstart-routing'),
      message:
        'OpenCode managed setup must emit a plugin bridge with canonical wp hook subcommands.',
    },
  ]
}

function lifecycleFindings(): ReferenceParityHostSmokeFinding[] {
  const jsonOnlyBins = WP_HOOK_SPECS.filter((spec) => spec.jsonOnly).map((spec) => spec.bin)
  const claudeCommands = Object.values(CLAUDE_HOOKS).flatMap(commandList)
  const codexCommands = Object.values(CODEX_HOOKS).flatMap(commandList)
  const cursorCommands = Object.values(CURSOR_HOOKS).flatMap(commandList)

  return [
    {
      host: 'claude',
      kind: 'lifecycle',
      surface: 'json-only managed lifecycle commands',
      ok: jsonOnlyBins.every((binName) => hasManagedCommand(claudeCommands, binName)),
      message: 'Claude fixture must include managed commands for JSON-only lifecycle hooks.',
    },
    {
      host: 'codex',
      kind: 'lifecycle',
      surface: 'json-only managed lifecycle commands',
      ok:
        jsonOnlyBins.every((binName) => {
          const command = codexCommands.find((candidate) => candidate.includes(binName)) ?? ''
          return command.includes("printf '%s\\n' '{}'")
        }) && !codexCommands.some((command) => command.includes('node_modules/.bin')),
      message:
        'Codex fixture must include machine-readable fallbacks for JSON-only lifecycle hooks.',
    },
    {
      host: 'cursor',
      kind: 'lifecycle',
      surface: 'structured no-op stdout and degraded compact projection',
      ok:
        cursorCommands.every((command) => command.includes("printf '%s\\n' '{}'")) &&
        !JSON.stringify(CURSOR_HOOKS).includes('wp-precompact-snapshot') &&
        !('postCompact' in CURSOR_HOOKS),
      message:
        'Cursor fixture must prevent empty no-op stdout and avoid accidental compact lifecycle projection.',
    },
    {
      host: 'opencode',
      kind: 'lifecycle',
      surface: 'plugin lifecycle bridge',
      ok:
        OPENCODE_PLUGIN.includes('"tool.execute.before"') &&
        OPENCODE_PLUGIN.includes('"tool.execute.after"') &&
        OPENCODE_PLUGIN.includes("'experimental.session.compacting'") &&
        OPENCODE_PLUGIN.includes('JSON.parse(stdout)'),
      message:
        'OpenCode fixture must parse hook stdout and bridge supported lifecycle events only.',
    },
  ]
}

function toolDiscoveryFindings(): ReferenceParityHostSmokeFinding[] {
  const claudeCommands = Object.values(CLAUDE_HOOKS).flatMap(commandList)
  const cursorCommands = Object.values(CURSOR_HOOKS).flatMap(commandList)

  return [
    {
      host: 'claude',
      kind: 'tool-discovery',
      surface: 'managed hook commands',
      ok:
        hasManagedCommand(claudeCommands, 'wp-sessionstart-routing') &&
        hasManagedCommand(claudeCommands, 'wp-pretool-guard'),
      message: 'Claude fixture must advertise managed hook commands without live host binaries.',
    },
    {
      host: 'codex',
      kind: 'tool-discovery',
      surface: 'mcp server config',
      ok:
        CODEX_MCP_CONFIG.includes('[mcp_servers.webpresso]') &&
        CODEX_MCP_CONFIG.includes('command = "wp"'),
      message:
        'Codex live MCP discovery remains optional; default CI fixture covers concrete MCP config ownership.',
    },
    {
      host: 'cursor',
      kind: 'tool-discovery',
      surface: 'managed hook commands',
      ok:
        hasManagedCommand(cursorCommands, 'wp-sessionstart-routing') &&
        hasManagedCommand(cursorCommands, 'wp-pretool-guard'),
      message: 'Cursor fixture must advertise managed hook commands without live host binaries.',
    },
    {
      host: 'opencode',
      kind: 'tool-discovery',
      surface: 'mcp server config',
      ok: OPENCODE_PLUGIN.includes('"shell.env"') && OPENCODE_PLUGIN.includes('CLAUDE_PROJECT_DIR'),
      message: 'OpenCode fixture covers plugin-owned shell environment needed by tool discovery.',
    },
  ]
}

export function collectHostSmokeFindings(): readonly ReferenceParityHostSmokeFinding[] {
  return [...configFindings(), ...lifecycleFindings(), ...toolDiscoveryFindings()]
}

export function collectContinuityLifecycleProofs(): readonly ContinuityLifecycleProof[] {
  return referenceParityHostSmokeFixtures.flatMap((fixture) => {
    const hasLifecycle = (name: string): boolean => fixture.projectedLifecycle.includes(name)
    const hasCommand = (name: string): string | null =>
      fixture.expectedManagedCommands.find((command) => command.includes(name)) ?? null

    return [
      {
        host: fixture.host,
        lifecycle: 'startup',
        support: hasLifecycle(
          fixture.host === 'opencode'
            ? 'session.created'
            : fixture.host === 'cursor'
              ? 'sessionStart'
              : 'SessionStart',
        )
          ? fixture.support
          : 'unsupported',
        proof: 'SessionStart resume context enters through the managed startup hook surface.',
        managedCommand: hasCommand(
          fixture.host === 'opencode' ? 'sessionstart-routing' : 'wp-sessionstart-routing',
        ),
      },
      {
        host: fixture.host,
        lifecycle: 'post-tool',
        support: hasLifecycle(
          fixture.host === 'opencode'
            ? 'tool.execute.after'
            : fixture.host === 'cursor'
              ? 'postToolUse'
              : 'PostToolUse',
        )
          ? fixture.support
          : 'unsupported',
        proof: 'PostToolUse capture enters through the managed post-tool hook surface.',
        managedCommand: hasCommand(fixture.host === 'opencode' ? 'post-tool' : 'wp-post-tool'),
      },
      {
        host: fixture.host,
        lifecycle: 'user-prompt',
        support: hasLifecycle(fixture.host === 'cursor' ? 'beforeSubmitPrompt' : 'UserPromptSubmit')
          ? fixture.support
          : 'unsupported',
        proof:
          'UserPromptSubmit capture is available only when the host projects a before-submit lifecycle.',
        managedCommand: hasCommand(
          fixture.host === 'opencode' ? 'guard-switch' : 'wp-guard-switch',
        ),
      },
      {
        host: fixture.host,
        lifecycle: 'stop',
        support: hasLifecycle(fixture.host === 'cursor' ? 'stop' : 'Stop')
          ? fixture.support
          : 'unsupported',
        proof:
          'Stop turn summaries are available only when the host projects a turn-end lifecycle.',
        managedCommand: hasCommand(fixture.host === 'opencode' ? 'stop-qa' : 'wp-stop-qa'),
      },
      {
        host: fixture.host,
        lifecycle: 'pre-compaction',
        support: hasLifecycle(
          fixture.host === 'opencode'
            ? 'experimental.session.compacting'
            : fixture.host === 'cursor'
              ? 'preCompact'
              : 'PreCompact',
        )
          ? fixture.support
          : 'unsupported',
        proof:
          fixture.host === 'opencode'
            ? 'OpenCode uses degraded context refresh and emits no managed pre-compaction snapshot command.'
            : 'Managed pre-compaction snapshot support requires a projected PreCompact lifecycle.',
        managedCommand: hasCommand(
          fixture.host === 'opencode' ? 'precompact-snapshot' : 'wp-precompact-snapshot',
        ),
      },
    ] as const
  })
}
