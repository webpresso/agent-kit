import { realpathSync } from 'node:fs'

import {
  PROJECT_SOURCES,
  resolveBlueprintProjects,
  type BlueprintProjectRef,
  type ResolveBlueprintProjectsOptions,
} from '#projects.js'

export interface ResolveProjectTarget {
  readonly cwd: string
  readonly projectId?: string
  readonly discovery?: Omit<ResolveBlueprintProjectsOptions, 'cwd'>
}

export type ResolveProjectResult =
  | {
      readonly ok: true
      readonly cwd: string
      readonly project_id: string | null
    }
  | {
      readonly ok: false
      readonly reason: 'not_found' | 'ambiguous'
      readonly summary: string
      readonly hint: string
      readonly candidates: readonly BlueprintProjectRef[]
    }

export interface ProjectResolver {
  listVisibleProjects(
    options: ResolveBlueprintProjectsOptions,
  ): Promise<readonly BlueprintProjectRef[]>
  resolve(target: ResolveProjectTarget): Promise<ResolveProjectResult>
  warm(projects: readonly BlueprintProjectRef[]): void
  invalidate(): void
}

interface CreateProjectResolverOptions {
  readonly ttlMs?: number
  readonly now?: () => number
  readonly resolveProjects?: (
    options: ResolveBlueprintProjectsOptions,
  ) => Promise<readonly BlueprintProjectRef[]>
}

const DEFAULT_PROJECT_RESOLUTION_CACHE_TTL_MS = 15_000

export function createProjectResolver(options: CreateProjectResolverOptions = {}): ProjectResolver {
  const now = options.now ?? Date.now
  const ttlMs = options.ttlMs ?? DEFAULT_PROJECT_RESOLUTION_CACHE_TTL_MS
  const resolveProjects = options.resolveProjects ?? resolveBlueprintProjects
  const recentProjectIndex = new Map<
    string,
    { readonly at: number; readonly project: BlueprintProjectRef }
  >()

  function evictExpired(key: string, at: number): void {
    if (now() - at > ttlMs) {
      recentProjectIndex.delete(key)
    }
  }

  function readRecentProjectMatch(
    projectId: string,
    resolvedPath: string | null,
  ): BlueprintProjectRef | null {
    const keys = [projectId]
    if (resolvedPath !== null) keys.push(resolvedPath)

    for (const key of keys) {
      const cached = recentProjectIndex.get(key)
      if (!cached) continue
      if (now() - cached.at > ttlMs) {
        recentProjectIndex.delete(key)
        continue
      }
      return cached.project
    }
    return null
  }

  function warm(projects: readonly BlueprintProjectRef[]): void {
    const at = now()
    for (const project of projects) {
      recentProjectIndex.set(project.project_id, { at, project })
      recentProjectIndex.set(project.worktree_path, { at, project })
      recentProjectIndex.set(project.repo_path, { at, project })
    }
  }

  async function listVisibleProjects(
    discovery: ResolveBlueprintProjectsOptions,
  ): Promise<readonly BlueprintProjectRef[]> {
    const projects = await resolveProjects(discovery)
    warm(projects)
    return projects
  }

  async function resolve(target: ResolveProjectTarget): Promise<ResolveProjectResult> {
    const { cwd, projectId } = target
    if (projectId !== undefined) {
      const resolvedPath = (() => {
        try {
          return realpathSync(projectId)
        } catch {
          return null
        }
      })()

      const cachedMatch = readRecentProjectMatch(projectId, resolvedPath)
      if (cachedMatch) {
        return { ok: true, cwd: cachedMatch.worktree_path, project_id: cachedMatch.project_id }
      }

      if (resolvedPath !== null) {
        return { ok: true, cwd: resolvedPath, project_id: null }
      }

      const projects = await listVisibleProjects({ cwd, ...target.discovery })
      const match =
        projects.find(
          (project) =>
            project.project_id === projectId ||
            project.worktree_path === projectId ||
            project.repo_path === projectId,
        ) ?? null

      if (match) {
        return { ok: true, cwd: match.worktree_path, project_id: match.project_id }
      }

      return {
        ok: false,
        reason: 'not_found',
        summary: `Project "${projectId}" not found`,
        hint: 'Call wp_blueprint_projects to pick an explicit project_id or pass a valid project path.',
        candidates: projects,
      }
    }

    const projects = await listVisibleProjects({ cwd, ...target.discovery })

    const current = projects.find((project) => project.source === PROJECT_SOURCES.current) ?? null
    if (current) {
      return { ok: true, cwd: current.worktree_path, project_id: current.project_id }
    }

    const currentScopeProjects = projects.filter(
      (project) => project.source === PROJECT_SOURCES.recursive_scan,
    )
    if (currentScopeProjects.length === 1) {
      const onlyProject = currentScopeProjects[0]
      if (!onlyProject) {
        return {
          ok: false,
          reason: 'not_found',
          summary: 'Recursive current project selection was empty',
          hint: 'No blueprint project could be resolved from the current working directory.',
          candidates: [],
        }
      }
      return { ok: true, cwd: onlyProject.worktree_path, project_id: onlyProject.project_id }
    }

    if (currentScopeProjects.length > 1) {
      return {
        ok: false,
        reason: 'ambiguous',
        summary: 'Multiple blueprint projects found under the current working directory',
        hint: 'Call wp_blueprint_projects and pass an explicit project_id to the blueprint tool you want to run.',
        candidates: currentScopeProjects,
      }
    }

    if (projects.length === 1) {
      const onlyProject = projects[0]
      if (!onlyProject) {
        return {
          ok: false,
          reason: 'not_found',
          summary: 'Single project selection was empty',
          hint: 'No blueprint project could be resolved from the current working directory.',
          candidates: [],
        }
      }
      return { ok: true, cwd: onlyProject.worktree_path, project_id: onlyProject.project_id }
    }

    if (projects.length > 1) {
      return {
        ok: false,
        reason: 'ambiguous',
        summary: 'Multiple blueprint projects are visible from the current workspace',
        hint: 'Call wp_blueprint_projects and pass an explicit project_id to disambiguate.',
        candidates: projects,
      }
    }

    return { ok: true, cwd, project_id: null }
  }

  function invalidate(): void {
    for (const [key, value] of recentProjectIndex.entries()) {
      evictExpired(key, value.at)
    }
    if (recentProjectIndex.size > 0) recentProjectIndex.clear()
  }

  return {
    listVisibleProjects,
    resolve,
    warm,
    invalidate,
  }
}
