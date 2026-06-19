#!/usr/bin/env bun

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import {
  SESSION_MEMORY_NATIVE_ADDON_FILENAME,
  type SessionMemoryNativeTarget,
  resolveSessionMemoryNativeTarget,
} from '../src/session-memory/native-targets.js'

export interface SessionMemoryNativeBuildOperation {
  readonly target: SessionMemoryNativeTarget
  readonly command: string
  readonly args: readonly string[]
  readonly sourceLibrary: string
  readonly addonDestination: string
}

interface BuildOptions {
  readonly rootDir?: string
  readonly selectedTarget?: string
}

function parseArg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

function platformLibraryName(platform: NodeJS.Platform): string {
  switch (platform) {
    case 'darwin':
      return 'libsession_memory_napi.dylib'
    case 'linux':
      return 'libsession_memory_napi.so'
    case 'win32':
      return 'session_memory_napi.dll'
    default:
      throw new Error(`Unsupported native session-memory platform ${platform}`)
  }
}

function selectHostTarget(selectedTarget?: string): SessionMemoryNativeTarget {
  const host = resolveSessionMemoryNativeTarget()
  if (!host) {
    throw new Error(`No session-memory native target for host ${process.platform}/${process.arch}`)
  }
  if (!selectedTarget || selectedTarget === 'host' || selectedTarget === host.id) return host
  throw new Error(
    `Cannot build session-memory native target ${selectedTarget} on host ${host.id}; provide a prebuilt artifact and run stage:session-memory-native instead`,
  )
}

export function buildSessionMemoryNativeCompileOperation(
  options: BuildOptions = {},
): SessionMemoryNativeBuildOperation {
  const rootDir = options.rootDir ?? process.cwd()
  const target = selectHostTarget(options.selectedTarget)
  const targetDir = resolve(rootDir, 'native', 'session-memory-engine', 'target')
  return {
    target,
    command: 'cargo',
    args: [
      'build',
      '--manifest-path',
      resolve(rootDir, 'native', 'session-memory-engine', 'Cargo.toml'),
      '--package',
      'session-memory-napi',
      '--release',
      '--locked',
    ],
    sourceLibrary: resolve(targetDir, 'release', platformLibraryName(target.os)),
    addonDestination: resolve(
      rootDir,
      'dist',
      'session-memory-native',
      target.id,
      SESSION_MEMORY_NATIVE_ADDON_FILENAME,
    ),
  }
}

if (import.meta.main) {
  const dryRun = process.argv.includes('--dry-run')
  const selectedTarget = parseArg('--target')
  const operation = buildSessionMemoryNativeCompileOperation({ selectedTarget })
  const printable = [operation.command, ...operation.args].join(' ')
  if (dryRun) {
    console.log(printable)
    console.log(`${operation.sourceLibrary} -> ${operation.addonDestination}`)
    process.exit(0)
  }

  const result = spawnSync(operation.command, [...operation.args], {
    stdio: 'inherit',
    env: process.env,
  })
  if (result.error) throw result.error
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1)
  if (!existsSync(operation.sourceLibrary)) {
    throw new Error(`native session-memory build did not produce ${operation.sourceLibrary}`)
  }

  mkdirSync(dirname(operation.addonDestination), { recursive: true })
  copyFileSync(operation.sourceLibrary, operation.addonDestination)
  console.log(operation.addonDestination)
}
