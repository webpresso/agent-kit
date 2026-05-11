import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import { load as yamlLoad } from 'js-yaml'
import { z } from 'zod'

const workspaceRepoSchema = z.object({
  path: z.string(),
})

const workspaceConfigSchema = z.object({
  repos: z.array(workspaceRepoSchema).default([]),
})

export type WorkspaceRepo = z.infer<typeof workspaceRepoSchema>
export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>

export function defaultWorkspaceConfigPath(): string {
  return path.join(homedir(), '.agent', 'workspace.yaml')
}

/**
 * Read `~/.agent/workspace.yaml`, parse with js-yaml, and validate with Zod.
 * Returns an empty `{ repos: [] }` config if the file is missing or invalid.
 */
export function loadWorkspaceConfig(configPath?: string): WorkspaceConfig {
  const target = configPath ?? defaultWorkspaceConfigPath()
  if (!existsSync(target)) {
    return workspaceConfigSchema.parse({})
  }
  try {
    const raw = readFileSync(target, 'utf8')
    const parsed = yamlLoad(raw)
    return workspaceConfigSchema.parse(parsed ?? {})
  } catch {
    return workspaceConfigSchema.parse({})
  }
}

/**
 * Returns expanded absolute paths from `~/.agent/workspace.yaml`.
 * Expands leading `~` using `os.homedir()`.
 */
export function getWorkspaceRepos(configPath?: string): string[] {
  const config = loadWorkspaceConfig(configPath)
  return config.repos.map((repo) => expandHome(repo.path))
}

function expandHome(repoPath: string): string {
  if (repoPath.startsWith('~/') || repoPath === '~') {
    return path.join(homedir(), repoPath.slice(2))
  }
  return repoPath
}

/**
 * Ensure `~/.agent/` directory exists. Used during workspace config
 * initialisation. Safe on all platforms via `mkdirSync` with `recursive`.
 */
export function ensureAgentDir(agentDir?: string): void {
  const target = agentDir ?? path.join(homedir(), '.agent')
  mkdirSync(target, { recursive: true })
}
