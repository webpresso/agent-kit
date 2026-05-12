#!/usr/bin/env bun
/**
 * `ak` — agent-kit CLI entrypoint.
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

const VERSION = readPackageVersion(import.meta.url)

const SUPPORTED_COMMANDS = [
  'blueprint',
  'roadmap',
  'sync',
  'audit',
  'compile',
  'rule',
  'skill',
  'skills',
  'docs',
  'setup',
  'init',
  'dev',
  'doctor',
  'err',
  'test',
  'e2e',
  'lint',
  'format',
  'tech-debt',
  'mcp',
  'hooks',
  'gain',
] as const

const ROOT_HELP = [
  'Usage: ak [command] [options]',
  '',
  'Core:',
  '  setup                 Scaffold a consumer repo with the agent surface',
  '  blueprint             Manage blueprints (list, new, show, exec, audit, ...)',
  '  gain                  Show token savings from RTK — run after any AI session',
  '  sync                  Sync agent rules + skills across IDE surfaces (--kind, --check)',
  '',
  'Quality:',
  '  audit                 Run packaged audits (bundle budgets, repo guardrails, TPH, tech-debt)',
  '  test                  Run tests through the portable agent-kit surface',
  '  lint                  Lint via oxlint (with pnpm fallback)',
  '  format                Format via oxfmt (--check for CI/husky)',
  '  e2e                   Build and run E2E commands through the portable agent-kit surface',
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
  '  mcp                   Run the agent-kit MCP server over stdio',
  '  hooks                 Verify plugin hook installation health',
  '  init                  Compatibility alias for setup',
  '',
  'Options:',
  '  -h, --help     Display this message',
  '  -v, --version  Display version number',
  '',
  'Run `ak <command> --help` for command-specific help.',
].join('\n')

export { SUPPORTED_COMMANDS }

export async function main(): Promise<number> {
  const cli = cac('ak')
  const argv = normalizeArgv(process.argv)
  const command = argv[2]
  const wantsVersion = argv.includes('--version') || argv.includes('-v')
  const wantsHelp = argv.includes('--help') || argv.includes('-h')
  const isNestedBlueprintHelp = command === 'blueprint' && wantsHelp && argv.length > 4
  const isRoadmapHelp = command === 'roadmap' && wantsHelp

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

  await bootstrapAk(argv)

  switch (command) {
    case 'blueprint': {
      const { registerBlueprintRouter } = await import('./commands/blueprint/router.js')
      registerBlueprintRouter(cli)
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
      registerInitCommand(cli, command)
      break
    }
    case 'dev': {
      const { registerDevCommand } = await import('./commands/dev.js')
      registerDevCommand(cli)
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
    default: {
      console.error(formatUnknownCommandError(command, SUPPORTED_COMMANDS))
      return 1
    }
  }

  cli.help()
  cli.version(VERSION)

  try {
    cli.parse(argv, { run: false })
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
