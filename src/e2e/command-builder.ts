import type { CommandConfig, E2eStepCommandOptions } from './types.js'
import { getManagedRunner, resolveOutputPolicy } from '#tool-runtime'

import path from 'node:path'

export function buildE2eCommand(options: E2eStepCommandOptions): CommandConfig {
  switch (options.step.runner) {
    case 'playwright':
      return buildPlaywrightCommand(options)
    case 'vitest':
      return buildVitestE2eCommand(options)
    case 'command':
      return buildCustomCommand(options)
  }
}

function buildPlaywrightCommand(options: E2eStepCommandOptions): CommandConfig {
  const { step } = options
  if (!step.configPath) {
    throw new Error(`Step ${step.logName} uses runner "playwright" but does not define configPath.`)
  }

  const paths = resolveRunnerPaths(step.configPath, options.files ?? [])
  const resolution = withBaseDir(
    getManagedRunner('playwright', {
      outputPolicy: resolveOutputPolicy(options.outputPolicy, options.filterOutput),
    }),
    paths.baseDir,
  )
  const args = [
    ...resolution.args,
    'test',
    '--config',
    resolution.usesBaseDir ? paths.relativeConfigArg : paths.rootConfigArg,
  ]
  appendPlaywrightFlags(args, options)
  args.push(
    ...(step.fixedArgs ?? []),
    ...(resolution.usesBaseDir ? paths.relativeFiles : paths.rootFiles),
    ...(options.passthrough ?? []),
  )
  return { command: resolution.command, args }
}

function buildVitestE2eCommand(options: E2eStepCommandOptions): CommandConfig {
  const { step } = options
  if (!step.configPath) {
    throw new Error(`Step ${step.logName} uses runner "vitest" but does not define configPath.`)
  }

  const paths = resolveRunnerPaths(step.configPath, options.files ?? [])
  const resolution = withBaseDir(
    getManagedRunner('vitest', {
      outputPolicy: resolveOutputPolicy(options.outputPolicy, options.filterOutput),
    }),
    paths.baseDir,
  )
  const args = [
    ...resolution.args,
    'run',
    '--config',
    resolution.usesBaseDir ? paths.relativeConfigArg : paths.rootConfigArg,
  ]
  if (options.workers !== undefined) {
    args.push('--poolOptions.threads.maxThreads', String(options.workers))
  }
  args.push(
    ...(step.fixedArgs ?? []),
    ...(resolution.usesBaseDir ? paths.relativeFiles : paths.rootFiles),
    ...(options.passthrough ?? []),
  )
  return { command: resolution.command, args }
}

function buildCustomCommand(options: E2eStepCommandOptions): CommandConfig {
  const { step } = options
  const commandArgs = step.commandArgs
  if (!commandArgs?.length) {
    throw new Error(`Step ${step.logName} uses runner "command" but does not define commandArgs.`)
  }

  return {
    command: commandArgs[0]!,
    args: [
      ...commandArgs.slice(1),
      ...(step.fixedArgs ?? []),
      ...(options.files ?? []),
      ...(options.passthrough ?? []),
    ],
  }
}

function appendPlaywrightFlags(args: string[], options: E2eStepCommandOptions): void {
  if (options.headed) {
    if (options.step.supportsHeaded === false) {
      throw new Error(`Step ${options.step.logName} does not support headed mode.`)
    }
    args.push('--headed')
  }

  if (options.debug) {
    if (options.step.supportsDebug === false) {
      throw new Error(`Step ${options.step.logName} does not support debug mode.`)
    }
    args.push('--debug')
  }

  if (options.workers !== undefined) {
    args.push('--workers', String(options.workers))
  }

  if (options.testList) {
    args.push('--test-list', options.testList)
  }
}

function resolveRunnerPaths(
  configPath: string,
  files: readonly string[],
): {
  baseDir: string
  rootConfigArg: string
  rootFiles: string[]
  relativeConfigArg: string
  relativeFiles: string[]
} {
  const normalizedConfigPath = configPath.replace(/\\/gu, '/')
  const baseDir = path.posix.dirname(normalizedConfigPath)
  const normalizedFiles = files.map((file) => file.replace(/\\/gu, '/'))

  if (baseDir === '.') {
    return {
      baseDir,
      rootConfigArg: normalizedConfigPath,
      rootFiles: normalizedFiles,
      relativeConfigArg: normalizedConfigPath,
      relativeFiles: normalizedFiles,
    }
  }

  return {
    baseDir,
    rootConfigArg: normalizedConfigPath,
    rootFiles: normalizedFiles.map((normalizedFile) => {
      if (path.posix.isAbsolute(normalizedFile) || normalizedFile.startsWith(`${baseDir}/`)) {
        return normalizedFile
      }
      return `${baseDir}/${normalizedFile}`
    }),
    relativeConfigArg: path.posix.basename(normalizedConfigPath),
    relativeFiles: normalizedFiles.map((normalizedFile) => {
      if (path.posix.isAbsolute(normalizedFile) || normalizedFile.startsWith(`${baseDir}/`)) {
        return path.posix.relative(baseDir, normalizedFile)
      }
      return normalizedFile
    }),
  }
}

function withBaseDir(
  resolution: { command: string; args: readonly string[] },
  baseDir: string,
): CommandConfig & { usesBaseDir: boolean } {
  if (baseDir === '.')
    return { command: resolution.command, args: [...resolution.args], usesBaseDir: true }

  if (resolution.command === 'vp') {
    return {
      command: resolution.command,
      args: ['--dir', baseDir, ...resolution.args],
      usesBaseDir: true,
    }
  }

  const [wrappedCommand, ...wrappedArgs] = resolution.args
  if (resolution.command === 'rtk' && wrappedCommand === 'vp') {
    return {
      command: resolution.command,
      args: ['vp', '--dir', baseDir, ...wrappedArgs],
      usesBaseDir: true,
    }
  }

  return { command: resolution.command, args: [...resolution.args], usesBaseDir: false }
}
