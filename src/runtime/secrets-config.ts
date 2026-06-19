import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { getDefaultSecretProvider, isSecretOrchestrationConfig } from '#secrets/config/schema.js'

export type SecretManagerName = 'doppler' | 'infisical'

export interface SecretsConfig {
  readonly manager: SecretManagerName
  readonly projectId: string
  readonly projectLabel?: string
  readonly profileEnvironments?: Readonly<Record<string, string>>
}

const COMMITTED_RELATIVE_PATH = path.join('.webpresso', 'secrets.config.json')
const RUNTIME_RELATIVE_PATH = path.join('webpresso', 'secrets.json')

function resolveGitCommonDir(cwd: string): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (!out) return null
    return path.isAbsolute(out) ? out : path.resolve(cwd, out)
  } catch {
    return null
  }
}

export function getRuntimeSecretsConfigPath(cwd: string = process.cwd()): string | null {
  const gitDir = resolveGitCommonDir(cwd)
  return gitDir ? path.join(gitDir, RUNTIME_RELATIVE_PATH) : null
}

export function getCommittedSecretsConfigPath(cwd: string = process.cwd()): string {
  return path.join(cwd, COMMITTED_RELATIVE_PATH)
}

export function getPreferredSecretsConfigPath(cwd: string = process.cwd()): string {
  return getRuntimeSecretsConfigPath(cwd) ?? getCommittedSecretsConfigPath(cwd)
}

function parseConfig(raw: string, source: string): SecretsConfig {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Malformed secrets config at ${source}: ${detail}`)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Malformed secrets config at ${source}: expected object`)
  }

  if (isSecretOrchestrationConfig(parsed)) {
    const provider = getDefaultSecretProvider(parsed)
    if (!provider) {
      throw new Error(`Malformed secrets config at ${source}: expected at least one provider`)
    }
    return {
      manager: provider.type as SecretManagerName,
      projectId: provider.project,
      projectLabel: provider.project,
      profileEnvironments: Object.fromEntries(
        Object.entries(parsed.profiles).map(([name, profile]) => [name, profile.environment]),
      ),
    }
  }

  throw new Error(
    `Malformed secrets config at ${source}: only schemaVersion 1 secret orchestration configs are supported`,
  )
}

export function readSecretsConfig(cwd: string = process.cwd()): SecretsConfig | null {
  const runtimePath = getRuntimeSecretsConfigPath(cwd)
  if (runtimePath && existsSync(runtimePath)) {
    return parseConfig(readFileSync(runtimePath, 'utf8'), runtimePath)
  }

  const committedPath = getCommittedSecretsConfigPath(cwd)
  if (existsSync(committedPath)) {
    return parseConfig(readFileSync(committedPath, 'utf8'), committedPath)
  }

  return null
}
