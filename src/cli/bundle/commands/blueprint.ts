import { spawn } from 'node:child_process'

import { placeholderCommand, placeholderGroup } from '#cli/bundle/commands/helpers.js'
import type { CliCommand } from '#cli/bundle/contract.js'

const SCOPE = 'Blueprint'

function getRawArgs(context: Parameters<NonNullable<CliCommand['run']>>[0]): readonly string[] {
  return context.rawArgs ?? []
}

function hasFlag(args: readonly string[], flag: string): boolean {
  return args.includes(flag)
}

function createBlueprintAuditCommand(): CliCommand {
  return {
    meta: { description: 'Audit blueprints', name: 'audit' },
    run: async (context) => {
      const rawArgs = getRawArgs(context)
      const asJson = hasFlag(rawArgs, '--json')
      const args = ['blueprint', 'audit', '--cwd', process.cwd()]
      if (hasFlag(rawArgs, '--all')) args.push('--all')
      if (hasFlag(rawArgs, '--staged')) args.push('--staged')
      if (hasFlag(rawArgs, '--strict')) args.push('--strict')
      if (asJson) args.push('--json')

      await new Promise<void>((resolve, reject) => {
        const child = spawn('wp', args, { stdio: 'inherit' })
        child.on('error', reject)
        child.on('exit', (code) => {
          if ((code ?? 1) === 0) {
            resolve()
            return
          }
          reject(new Error('Blueprint bundle command "audit" reported audit issues.'))
        })
      })
    },
  }
}

export const blueprintCommands = {
  audit: createBlueprintAuditCommand(),
  exec: placeholderGroup(SCOPE, 'exec', 'Execute a blueprint', {
    logs: placeholderCommand(SCOPE, 'logs', 'Show blueprint execution logs'),
    resume: placeholderCommand(SCOPE, 'resume', 'Resume blueprint execution'),
    status: placeholderCommand(SCOPE, 'status', 'Show blueprint execution status'),
    stop: placeholderCommand(SCOPE, 'stop', 'Stop blueprint execution'),
  }),
  finalize: placeholderCommand(SCOPE, 'finalize', 'Finalize a blueprint'),
  list: placeholderCommand(SCOPE, 'list', 'List blueprints'),
  move: placeholderCommand(SCOPE, 'move', 'Move a blueprint between lifecycle states'),
  new: placeholderCommand(SCOPE, 'new', 'Create a blueprint draft'),
  park: placeholderCommand(SCOPE, 'park', 'Park a blueprint'),
  show: placeholderCommand(SCOPE, 'show', 'Show a blueprint'),
  start: placeholderCommand(SCOPE, 'start', 'Start a blueprint'),
  task: placeholderGroup(SCOPE, 'task', 'Manage blueprint tasks', {
    block: placeholderCommand(SCOPE, 'block', 'Block a blueprint task'),
    complete: placeholderCommand(SCOPE, 'complete', 'Complete a blueprint task'),
    start: placeholderCommand(SCOPE, 'start', 'Start a blueprint task'),
    unblock: placeholderCommand(SCOPE, 'unblock', 'Unblock a blueprint task'),
  }),
} satisfies Record<string, CliCommand>
