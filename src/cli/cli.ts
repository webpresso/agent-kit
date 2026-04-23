#!/usr/bin/env node
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

const SUPPORTED_COMMANDS = ['blueprint', 'symlink', 'audit', 'skills', 'docs', 'init'] as const

const ROOT_HELP = [
  'Usage: ak [command] [options]',
  '',
  'Commands:',
  '  blueprint    Manage blueprints (list, new, show, exec, audit, ...)',
  '  symlink      Sync agent-surface files (sync, check)',
  '  audit        Run packaged audits (tph, tph-e2e, bundle-budget)',
  '  skills       Manage agent skills (list, install, refresh)',
  '  docs         Documentation tooling (lint)',
  '  init         Scaffold a consumer repo with the agent surface',
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

  await bootstrapAk(argv)

  switch (command) {
    case 'blueprint': {
      const { registerBlueprintRouter } = await import('./commands/blueprint/router.js')
      registerBlueprintRouter(cli)
      break
    }
    case 'symlink': {
      const { registerSymlinkCommand } = await import('./commands/symlink.js')
      registerSymlinkCommand(cli)
      break
    }
    case 'audit': {
      const { registerAuditCommand } = await import('./commands/audit.js')
      registerAuditCommand(cli)
      break
    }
    case 'skills': {
      const { registerSkillsCommand } = await import('./commands/skills.js')
      registerSkillsCommand(cli)
      break
    }
    case 'docs': {
      const { registerDocsCommand } = await import('./commands/docs.js')
      registerDocsCommand(cli)
      break
    }
    case 'init': {
      const { registerInitCommand } = await import('./commands/init/index.js')
      registerInitCommand(cli)
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
