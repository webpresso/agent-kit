#!/usr/bin/env bun
/**
 * `wp` — webpresso CLI entrypoint.
 *
 * Lazy-loads subcommand modules based on the first argv to keep startup
 * cheap. Modeled on apps/cli-wp/src/cli.ts.
 */

import { cac } from 'cac'
import { existsSync, realpathSync } from 'node:fs'
import { resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { bootstrapAk } from './bootstrap.js'
import { formatUnknownCommandError, normalizeArgv, readPackageVersion } from './utils.js'
import { detectWrappedWpRuntimeInvocation, formatWrappedWpInvocationError } from './wrapped-wp.js'
import { registerWpExtensions, resolveWpCommandAlias } from './wp-extensions.js'

const VERSION = readPackageVersion(import.meta.url)

const SUPPORTED_COMMANDS = [
  'blueprint',
  'config',
  'roadmap',
  'sync',
  'audit',
  'qa',
  'compile',
  'rule',
  'skill',
  'skills',
  'docs',
  'setup',
  'init',
  'dev',
  'deploy',
  'doctor',
  'err',
  'test',
  'e2e',
  'ci',
  'typecheck',
  'lint',
  'format',
  'logs',
  'tech-debt',
  'worktree',
  'mcp',
  'hook',
  'hooks',
  'gain',
  'bench',
  'install',
  'add',
  'remove',
  'update',
  'exec',
  'run',
] as const

const ROOT_HELP = [
  'Usage: wp [command] [options]',
  '       webpresso [command] [options]  (alias)',
  '',
  'Core:',
  '  setup                 Scaffold a consumer repo with the agent surface',
  '  blueprint             Manage blueprints (list, new, show, exec, audit, ...)',
  '  config                Repo configuration (secrets set/show/status/setup)',
  '  gain                  Show Webpresso gain metadata plus separate RTK gain totals',
  '  sync                  Sync agent rules + skills across IDE surfaces (--kind, --check)',
  '  bench                 Run the session-memory benchmark harness',
  '  install               Install dependencies through the managed vp facade',
  '  add                   Add dependencies through the managed vp facade',
  '  remove                Remove dependencies through the managed vp facade',
  '  update                Refresh wp and any wp-managed optional OMX/OMC/gstack integrations by default; use --deps for local dependencies (--global is an alias)',
  '  exec                  Run a binary through the managed vp facade',
  '  run                   Run a package script through the managed vp facade',
  '',
  'Quality:',
  '  audit                 Run packaged audits (bundle budgets, repo guardrails, TPH, tech-debt)',
  '  qa                    Run the repository QA gate through the portable wp surface',
  '  test                  Run tests through the portable webpresso surface',
  '  typecheck             Typecheck the current workspace through the portable wp surface',
  '  lint                  Lint via oxlint (via wp/VP; local runtime fallback only)',
  '  format                Format through the portable wp surface (--check for CI/husky)',
  '  e2e                   Build and run E2E commands through the portable webpresso surface',
  '  ci                    Run repository CI helpers through the portable wp surface',
  '  logs                  Print persisted raw output from recent quality runs',
  '',
  'Advanced:',
  '  roadmap               List or show parent roadmaps directly',
  '  compile               Compile .agent/ assets and run rulesync generate for target IDEs',
  '  rule                  Manage consumer rules (new, list, show, deprecate)',
  '  skill                 Manage consumer skills (new, list, show, deprecate, install, uninstall)',
  '  docs                  Documentation tooling (lint)',
  '  dev                   Run a manifest-backed development target',
  '  doctor                Run repo audit health checks (hook/plugin health stays under hooks doctor)',
  '  err                   Run a command and show only failures (hooks + CI)',
  '  tech-debt             Manage tech-debt lifecycle (new, list, review)',
  '  worktree              Git worktree management with .agent/ seeding (new, list, remove)',
  '  mcp                   Run the webpresso MCP server over stdio',
  '  hooks                 Verify plugin hook installation health',
  '  init                  Compatibility alias for setup',
  '',
  'Options:',
  '  -h, --help     Display this message',
  '  -v, --version  Display version number',
  '',
  'Run `wp <command> --help` for command-specific help.',
].join('\n')

export { SUPPORTED_COMMANDS }

export async function main(): Promise<number> {
  const cli = cac('wp')
  const argv = normalizeArgv(process.argv)
  const command = argv[2]
  const wantsVersion = argv.includes('--version') || argv.includes('-v')
  const wantsHelp = argv.includes('--help') || argv.includes('-h')
  const isNestedBlueprintHelp = command === 'blueprint' && wantsHelp && argv.length > 4
  const isRoadmapHelp = command === 'roadmap' && wantsHelp
  const isNestedBenchHelp = command === 'bench' && wantsHelp && argv.length > 4
  const isBenchHelp = command === 'bench' && wantsHelp

  if (wantsVersion && (!command || command.startsWith('-'))) {
    console.log(VERSION)
    return 0
  }

  if (!command || command.startsWith('-')) {
    console.log(ROOT_HELP)
    return 0
  }

  if (isNestedBlueprintHelp) {
    const { getBlueprintHelpText } = await import('./commands/blueprint/router-output.js')
    console.log(getBlueprintHelpText())
    return 0
  }

  if (isRoadmapHelp) {
    const { getRoadmapHelpText } = await import('./commands/roadmap.js')
    console.log(getRoadmapHelpText())
    return 0
  }

  if (isNestedBenchHelp) {
    const { getBenchSessionMemoryCommandHelpText } = await import('./commands/bench/index.js')
    console.log(getBenchSessionMemoryCommandHelpText())
    return 0
  }

  if (isBenchHelp) {
    const { getBenchHelpText } = await import('./commands/bench/index.js')
    console.log(getBenchHelpText())
    return 0
  }

  if (!wantsHelp && !wantsVersion && command !== 'mcp') {
    const wrapped = detectWrappedWpRuntimeInvocation({ argv, env: process.env })
    if (wrapped) {
      console.error(formatWrappedWpInvocationError(wrapped, argv))
      return 1
    }
  }

  await bootstrapAk(VERSION, argv)

  const extensionRuntime = await registerWpExtensions({
    cli,
    cwd: process.cwd(),
    env: process.env,
    hostVersion: VERSION,
    baseCommands: [...SUPPORTED_COMMANDS],
  })
  for (const warning of extensionRuntime.warnings) console.error(warning)
  const resolvedCommand = resolveWpCommandAlias(command, extensionRuntime.aliasMap)

  switch (resolvedCommand) {
    case 'blueprint': {
      const { registerBlueprintRouter } = await import('./commands/blueprint/router.js')
      registerBlueprintRouter(cli)
      break
    }
    case 'config': {
      const { registerConfigCommand } = await import('./commands/config.js')
      registerConfigCommand(cli)
      break
    }
    case 'roadmap': {
      const { registerRoadmapCommand } = await import('./commands/roadmap.js')
      registerRoadmapCommand(cli)
      break
    }
    case 'sync': {
      const { registerSyncCommand } = await import('./commands/sync.js')
      registerSyncCommand(cli)
      break
    }
    case 'audit': {
      const { registerAuditCommand } = await import('./commands/audit.js')
      registerAuditCommand(cli)
      break
    }
    case 'qa': {
      const { registerQaCommand } = await import('./commands/qa.js')
      registerQaCommand(cli)
      break
    }
    case 'compile': {
      const { registerCompileCommand } = await import('./commands/compile.js')
      registerCompileCommand(cli)
      break
    }
    case 'rule': {
      const { registerRuleCommand } = await import('./commands/rule.js')
      registerRuleCommand(cli)
      break
    }
    case 'skill': {
      const { registerSkillCommand } = await import('./commands/skill.js')
      registerSkillCommand(cli)
      break
    }
    case 'skills': {
      const { registerSkillsRenameStub } = await import('./commands/skill.js')
      registerSkillsRenameStub(cli)
      break
    }
    case 'docs': {
      const { registerDocsCommand } = await import('./commands/docs.js')
      registerDocsCommand(cli)
      break
    }
    case 'setup':
    case 'init': {
      const { registerInitCommand } = await import('./commands/init/index.js')
      registerInitCommand(cli, resolvedCommand)
      break
    }
    case 'dev': {
      const { registerDevCommand } = await import('./commands/dev.js')
      registerDevCommand(cli)
      break
    }
    case 'deploy': {
      const { registerDeployCommand } = await import('./commands/deploy.js')
      registerDeployCommand(cli)
      break
    }
    case 'doctor': {
      const { registerDoctorCommand } = await import('./commands/doctor.js')
      registerDoctorCommand(cli)
      break
    }
    case 'err': {
      const { registerErrCommand } = await import('./commands/err.js')
      registerErrCommand(cli)
      break
    }
    case 'test': {
      const { registerTestCommand } = await import('./commands/test.js')
      registerTestCommand(cli)
      break
    }
    case 'e2e': {
      const { registerE2eCommand } = await import('./commands/e2e.js')
      registerE2eCommand(cli)
      break
    }
    case 'ci': {
      const { registerCiCommand } = await import('./commands/ci.js')
      registerCiCommand(cli)
      break
    }
    case 'typecheck': {
      const { registerTypecheckCommand } = await import('./commands/typecheck.js')
      registerTypecheckCommand(cli)
      break
    }
    case 'lint': {
      const { registerLintCommand } = await import('./commands/lint.js')
      registerLintCommand(cli)
      break
    }
    case 'format': {
      const { registerFormatCommand } = await import('./commands/format.js')
      registerFormatCommand(cli)
      break
    }
    case 'logs': {
      const { registerLogsCommand } = await import('./commands/logs.js')
      registerLogsCommand(cli)
      break
    }
    case 'tech-debt': {
      const { registerTechDebtRouter } = await import('./commands/tech-debt/router.js')
      registerTechDebtRouter(cli)
      break
    }
    case 'mcp': {
      const { registerMcpCommand } = await import('./commands/mcp.js')
      registerMcpCommand(cli)
      break
    }
    case 'hook': {
      const { registerHookCommand } = await import('./commands/hook.js')
      registerHookCommand(cli)
      break
    }
    case 'hooks': {
      const { registerHooksCommand } = await import('./commands/hooks.js')
      registerHooksCommand(cli)
      break
    }
    case 'gain': {
      const { registerGainCommand } = await import('./commands/gain/index.js')
      registerGainCommand(cli)
      break
    }
    case 'bench': {
      const { registerBenchCommand } = await import('./commands/bench/index.js')
      registerBenchCommand(cli)
      break
    }
    case 'install':
    case 'add':
    case 'remove':
    case 'update':
    case 'exec':
    case 'run': {
      const { registerPackageManagerCommand } = await import('./commands/package-manager.js')
      registerPackageManagerCommand(cli, resolvedCommand)
      break
    }
    case 'worktree': {
      const { registerWorktreeRouter } = await import('./commands/worktree/router.js')
      registerWorktreeRouter(cli)
      break
    }
    default: {
      if (!resolvedCommand || !extensionRuntime.commandNames.includes(resolvedCommand)) {
        console.error(formatUnknownCommandError(command, SUPPORTED_COMMANDS))
        return 1
      }
    }
  }

  cli.help()
  cli.version(VERSION)

  try {
    const effectiveArgv =
      resolvedCommand && resolvedCommand !== command
        ? [argv[0] ?? 'node', argv[1] ?? 'wp', resolvedCommand, ...argv.slice(3)]
        : argv
    cli.parse(effectiveArgv, { run: false })
    const result = await cli.runMatchedCommand()
    return typeof result === 'number' ? result : 0
  } catch (error) {
    const exitCode =
      typeof error === 'object' && error !== null && 'exitCode' in error
        ? Number((error as { exitCode: unknown }).exitCode)
        : 1
    const message = error instanceof Error ? error.message : String(error)
    if (message && message !== 'exit') console.error(message)
    return Number.isFinite(exitCode) ? exitCode : 1
  }
}

const isMain = detectMainEntrypoint()

function detectMainEntrypoint(): boolean {
  // Bun-specific fast path.
  if (typeof import.meta.main === 'boolean' && import.meta.main) return true

  if (typeof process === 'undefined' || process.argv[1] === undefined) return false

  // Node: resolve both sides to absolute real paths so relative argv and
  // macOS /tmp → /private/tmp symlink drift don't cause false negatives.
  try {
    const argvPath = pathResolve(process.argv[1])
    const modulePath = fileURLToPath(import.meta.url)
    const realArgv = existsSync(argvPath) ? realpathSync(argvPath) : argvPath
    const realModule = existsSync(modulePath) ? realpathSync(modulePath) : modulePath
    return realArgv === realModule
  } catch {
    return false
  }
}

if (isMain) {
  main()
    .then((code) => {
      process.exit(code)
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
