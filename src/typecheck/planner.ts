import { existsSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { getPackageScript, readPackageJson, isRecursiveWpScript } from '#cli/package-scripts.js'
import { getWorkspacePackages, type PackageInfo } from '#quality-engine/target-resolver.js'
import { getManagedRunner } from '#tool-runtime'

export interface TypecheckScope {
  readonly name: string
  readonly root: string
  readonly relativeRoot: string
  readonly kind: 'root' | 'workspace'
}

export interface PlannedTypecheckCommand {
  readonly scope: TypecheckScope | null
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env?: Record<string, string>
}

export interface TypecheckExecutionPlan {
  readonly repoRoot: string
  readonly mode: 'default' | 'files' | 'packages'
  readonly commands: readonly PlannedTypecheckCommand[]
  readonly resolvedScopes: readonly TypecheckScope[]
  readonly preambleLine?: string
}

export interface PlanTypecheckExecutionOptions {
  readonly repoRoot: string
  readonly defaultScopeRoot?: string
  readonly files?: readonly string[]
  readonly packages?: readonly string[]
  readonly pretty?: boolean
}

const GENERATED_ROOT_PREFIXES = ['.webpresso/generated'] as const
const OUTPUT_SEGMENTS = new Set(['coverage', 'dist', 'node_modules'])

interface ScopedPackageInfo extends PackageInfo {
  readonly root: string
  readonly relativeRoot: string
  readonly kind: 'workspace'
}

export function planTypecheckExecution(
  options: PlanTypecheckExecutionOptions,
): TypecheckExecutionPlan {
  const repoRoot = resolve(options.repoRoot)
  const defaultScopeRoot = resolve(options.defaultScopeRoot ?? repoRoot)
  const realRepoRoot = realpathSync(repoRoot)
  const files = normalizeTargets(options.files)
  const packages = normalizeTargets(options.packages)

  if (files.length > 0 && packages.length > 0) {
    throw new Error('Cannot use both --file and --package for typecheck targeting.')
  }

  if (packages.length > 0) {
    const scopes = resolvePackageScopes(repoRoot, realRepoRoot, packages)
    return {
      repoRoot,
      mode: 'packages',
      commands: scopes.map((scope) => buildTargetedCommand(scope, options.pretty)),
      resolvedScopes: scopes,
      preambleLine: formatResolvedScopesLine(scopes),
    }
  }

  if (files.length > 0) {
    const scopes = resolveFileScopes(repoRoot, realRepoRoot, files)
    return {
      repoRoot,
      mode: 'files',
      commands: scopes.map((scope) => buildTargetedCommand(scope, options.pretty)),
      resolvedScopes: scopes,
      preambleLine: formatResolvedScopesLine(scopes),
    }
  }

  return {
    repoRoot,
    mode: 'default',
    commands: [buildUntargetedCommand(defaultScopeRoot, options.pretty)],
    resolvedScopes: [],
  }
}

export function formatResolvedScopesLine(scopes: readonly TypecheckScope[]): string {
  return `Resolved typecheck scopes: ${scopes.map((scope) => scope.name).join(', ')}`
}

function buildUntargetedCommand(cwd: string, pretty = false): PlannedTypecheckCommand {
  const checkTypesScript = getPackageScript(cwd, 'check-types')
  if (checkTypesScript && !isRecursiveWpScript(checkTypesScript, 'typecheck')) {
    const resolution = getManagedRunner('vp')
    return {
      scope: null,
      command: resolution.command,
      args: [...resolution.args, 'run', 'check-types'],
      cwd,
    }
  }

  const resolution = getManagedRunner('tsc')
  return {
    scope: null,
    command: resolution.command,
    args: [...resolution.args, '--noEmit', ...(pretty ? [] : ['--pretty', 'false'])],
    cwd,
  }
}

function buildTargetedCommand(scope: TypecheckScope, pretty = false): PlannedTypecheckCommand {
  const checkTypesScript = getPackageScript(scope.root, 'check-types')
  if (checkTypesScript && !isRecursiveWpScript(checkTypesScript, 'typecheck')) {
    const resolution = getManagedRunner('vp')
    return {
      scope,
      command: resolution.command,
      args: [...resolution.args, 'run', 'check-types'],
      cwd: scope.root,
    }
  }

  if (!existsSync(join(scope.root, 'tsconfig.json'))) {
    throw new Error(
      `Resolved scope ${scope.name} (${scope.relativeRoot}) has no non-recursive check-types script and no tsconfig.json. ` +
        'Pass a source file inside a typechecked scope or use --package for a package with a valid typecheck contract.',
    )
  }

  const resolution = getManagedRunner('tsc')
  return {
    scope,
    command: resolution.command,
    args: [...resolution.args, '--noEmit', ...(pretty ? [] : ['--pretty', 'false'])],
    cwd: scope.root,
  }
}

function resolvePackageScopes(
  repoRoot: string,
  realRepoRoot: string,
  targetNames: readonly string[],
): TypecheckScope[] {
  const rootScope = getRootScope(repoRoot, realRepoRoot)
  const workspaceScopes = getWorkspaceScopes(repoRoot)
  const scopeMap = new Map<string, TypecheckScope>()

  scopeMap.set(rootScope.name, rootScope)
  for (const scope of workspaceScopes) {
    if (scopeMap.has(scope.name)) {
      throw new Error(
        `Duplicate workspace package name detected for typecheck scope: ${scope.name}`,
      )
    }
    scopeMap.set(scope.name, scope)
  }

  return targetNames.map((targetName) => {
    const scope = scopeMap.get(targetName)
    if (scope) return scope
    throw new Error(
      `Unknown package "${targetName}". --package requires an exact package.json name and does not support fuzzy or path matching.`,
    )
  })
}

function resolveFileScopes(
  repoRoot: string,
  realRepoRoot: string,
  rawTargets: readonly string[],
): TypecheckScope[] {
  const rootScope = getRootScope(repoRoot, realRepoRoot)
  const workspaceScopes = getWorkspaceScopes(repoRoot)
  const orderedScopes: TypecheckScope[] = []
  const seen = new Set<string>()

  for (const rawTarget of rawTargets) {
    const absoluteInput = isAbsolute(rawTarget) ? resolve(rawTarget) : resolve(repoRoot, rawTarget)
    if (!existsSync(absoluteInput)) {
      throw new Error(`Typecheck target not found: ${rawTarget}`)
    }

    const inputStats = statSync(absoluteInput)
    if (!inputStats.isFile()) {
      throw new Error(
        `Typecheck --file expects a source file, but "${rawTarget}" resolved to a non-file target. Use --package for package-scoped checks.`,
      )
    }

    const realTarget = realpathSync(absoluteInput)
    if (!isWithin(realTarget, realRepoRoot)) {
      throw new Error(
        `Typecheck target "${rawTarget}" resolves outside the repository root: ${realTarget}`,
      )
    }

    const repoRelativeInput = toRepoRelative(repoRoot, absoluteInput)
    const repoRelativeReal = toRepoRelative(realRepoRoot, realTarget)
    const blockedTarget =
      findBlockedTarget(repoRelativeInput) ?? findBlockedTarget(repoRelativeReal)
    if (blockedTarget) {
      throw new Error(
        `Refusing generated/output target "${rawTarget}" (${repoRelativeReal}) because it is under ${blockedTarget}. Pass a source file or use --package instead.`,
      )
    }

    const packageMatches = workspaceScopes.filter((scope) => isWithin(realTarget, scope.root))
    if (packageMatches.length > 1) {
      throw new Error(
        `Typecheck target "${rawTarget}" (${repoRelativeReal}) is ambiguous across multiple workspace scopes: ${packageMatches
          .map((scope) => scope.name)
          .join(', ')}`,
      )
    }

    const scope = packageMatches[0] ?? rootScope
    if (!seen.has(scope.root)) {
      seen.add(scope.root)
      orderedScopes.push(scope)
    }
  }

  return orderedScopes
}

function getRootScope(repoRoot: string, realRepoRoot: string): TypecheckScope {
  const packageName = readPackageJson(repoRoot)?.name
  return {
    name: typeof packageName === 'string' && packageName.trim().length > 0 ? packageName : '.',
    root: realRepoRoot,
    relativeRoot: '.',
    kind: 'root',
  }
}

function getWorkspaceScopes(repoRoot: string): ScopedPackageInfo[] {
  return getWorkspacePackages(repoRoot).map((pkg) => {
    const absoluteRoot = realpathSync(pkg.path)
    return {
      ...pkg,
      root: absoluteRoot,
      relativeRoot: relative(repoRoot, pkg.path).replaceAll('\\', '/'),
      kind: 'workspace',
    }
  })
}

function normalizeTargets(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0)
}

function toRepoRelative(baseRoot: string, absolutePath: string): string {
  return relative(baseRoot, absolutePath).replaceAll('\\', '/')
}

function isWithin(candidate: string, scopeRoot: string): boolean {
  const rel = relative(scopeRoot, candidate)
  return rel === '' || (!rel.startsWith('..') && rel !== '.' && !isAbsolute(rel))
}

function findBlockedTarget(repoRelativePath: string): string | null {
  if (repoRelativePath === '' || repoRelativePath.startsWith('../')) return null

  for (const prefix of GENERATED_ROOT_PREFIXES) {
    if (repoRelativePath === prefix || repoRelativePath.startsWith(`${prefix}/`)) {
      return prefix
    }
  }

  const segments = repoRelativePath.split('/').filter(Boolean)
  for (const segment of segments) {
    if (OUTPUT_SEGMENTS.has(segment)) {
      return segment
    }
  }

  return null
}
