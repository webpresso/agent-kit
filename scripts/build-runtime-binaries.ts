#!/usr/bin/env bun

import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import {
  RUNTIME_TARGETS,
  resolveRuntimeTarget,
  runtimeBinaryFilename,
  type RuntimeTarget,
} from '../src/build/runtime-targets.js'

export interface RuntimeCompileCommand {
  readonly target: RuntimeTarget
  readonly command: string
  readonly args: readonly string[]
  readonly outfile: string
}

interface BuildOptions {
  readonly rootDir?: string
  readonly selectedTarget?: string
}

function selectTargets(selectedTarget?: string): readonly RuntimeTarget[] {
  if (!selectedTarget) return RUNTIME_TARGETS
  if (selectedTarget === 'host') {
    const target = resolveRuntimeTarget()
    if (!target) {
      throw new Error(`No compiled runtime target for host ${process.platform}/${process.arch}`)
    }
    return [target]
  }

  const target = RUNTIME_TARGETS.find((candidate) => candidate.id === selectedTarget)
  if (!target) {
    throw new Error(`Unknown runtime target ${selectedTarget}`)
  }
  return [target]
}

export function buildRuntimeCompileCommands(
  options: BuildOptions = {},
): readonly RuntimeCompileCommand[] {
  const rootDir = options.rootDir ?? process.cwd()
  return selectTargets(options.selectedTarget).map((target) => {
    const outfile = resolve(rootDir, 'dist', 'runtime', target.id, runtimeBinaryFilename(target))
    return {
      target,
      command: 'bun',
      args: [
        'build',
        resolve(rootDir, 'src', 'cli', 'cli.ts'),
        '--compile',
        '--target',
        target.bunTarget,
        '--outfile',
        outfile,
      ],
      outfile,
    }
  })
}

function parseArg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

if (import.meta.main) {
  const dryRun = process.argv.includes('--dry-run')
  const selectedTarget = parseArg('--target')
  const commands = buildRuntimeCompileCommands({ selectedTarget })

  for (const command of commands) {
    mkdirSync(dirname(command.outfile), { recursive: true })
    const printable = [command.command, ...command.args].join(' ')
    if (dryRun) {
      console.log(printable)
      continue
    }

    const result = spawnSync(command.command, [...command.args], {
      stdio: 'inherit',
      env: process.env,
    })
    if (result.error) throw result.error
    if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1)
  }
}
