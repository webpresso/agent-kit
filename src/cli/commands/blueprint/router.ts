import type { BlueprintExecutionSpec } from '#index'
import type { CAC } from 'cac'

import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { parseBlueprintForDb } from '#db/parser/blueprint-db-parser'
import { blueprintToSpecKit } from '#export/spec-kit/index'

import { getProjectRoot } from '#cli/utils'
import {
  clearBlueprintWorktreeOwnership,
  ensureBlueprintOwnerWorktree,
} from '#worktrees/manager.js'
import { resolveBlueprintRoot } from '#utils/blueprint-root'
import { getBlueprintDocumentPaths } from '#utils/document-paths.js'
import {
  applyBlueprintLifecycleToFile,
  BlueprintCreationService,
  BlueprintService,
  type Blueprint,
  type BlueprintAuditResult,
  type BlueprintLifecycleIntent,
  complexitySchema,
  type CreatedBlueprint,
  type PlanComplexity,
  relativeBlueprintSlug,
  type BlueprintSummary,
  parseBlueprint,
  planStatusSchema,
  runBlueprintAudit,
  resolveBlueprintFile,
  serializeBlueprint,
  validateAllTasksDone,
} from '#local'
import { resolvePackageAssetPreferred } from '#utils/package-assets'

import {
  describeBlueprintExecutionRuntime,
  buildBlueprintLaunchSpec,
  buildStoppedRuntimeEvidence,
  controlBlueprintExecution,
  initializeBlueprintExecutionProgressBridge,
  launchBlueprintExecution,
  persistBlueprintExecutionArtifacts,
  persistBlueprintExecutionMetadata,
  recordLaunchFailure,
  reconcileBlueprintRuntimeSnapshot,
  readBlueprintExecutionState,
  syncBlueprintExecutionProgress,
  writeBlueprintRuntimeSnapshot,
} from './execution.js'
import {
  advanceTask as advanceTaskMutation,
  finalizeBlueprint as finalizeBlueprintMutation,
  promoteBlueprint as promoteBlueprintMutation,
  type AdvanceTaskResult,
  type PromoteBlueprintResult,
} from './mutations.js'
import { BlueprintAuditFailedError, executeBlueprintSubcommand } from './router-dispatch.js'
import {
  formatBlueprintAudit,
  formatBlueprintCreation,
  formatBlueprintDetails,
  formatBlueprintExecution,
  formatBlueprintSummaries,
  getBlueprintHelpText,
  handleBlueprintError,
  printBlueprintOutput,
} from './router-output.js'

export { formatBlueprintSummaries } from './router-output.js'

type BlueprintStatus = (typeof planStatusSchema.options)[number]

interface BlueprintListOptions {
  json?: boolean
  noTui?: boolean
  onlyRoadmaps?: boolean
  projectRoot?: string
  status?: string
}

interface BlueprintShowOptions {
  json?: boolean
  projectRoot?: string
}

interface BlueprintMoveOptions {
  forceRecovery?: boolean
  json?: boolean
  projectRoot?: string
}

interface BlueprintAuditOptions {
  all?: boolean
  json?: boolean
  projectRoot?: string
  staged?: boolean
  strict?: boolean
}

interface BlueprintNewOptions {
  complexity?: string
  json?: boolean
  projectRoot?: string
  templatePath?: string
  type?: string
}

type BlueprintDocumentType = 'blueprint' | 'parent-roadmap'

export interface BlueprintCommandOptions
  extends BlueprintAuditOptions, BlueprintMoveOptions, BlueprintListOptions, BlueprintNewOptions {
  format?: string
  listTemplates?: boolean
  params?: string
  reason?: string
  template?: string
  templatesDir?: string
  to?: string
  '--': string[]
}

export type { AdvanceTaskResult, PromoteBlueprintResult }

interface ResolvedBlueprintLocation {
  blueprint: Blueprint
  path: string
  slug: string
}

export interface ShowBlueprintResult {
  blueprint: Blueprint
  location: {
    path: string
    projectRoot: string
  }
  slug: string
}

export interface MoveBlueprintResult {
  fromPath: string
  fromStatus: string
  message: string
  moved: boolean
  slug: string
  toPath: string
  toStatus: BlueprintStatus
  updated: boolean
}

export interface BlueprintLifecycleMutationResult {
  message: string
  moved: boolean
  progress: string
  slug: string
  status: string
  taskId?: string
}

export interface CreateBlueprintResult extends CreatedBlueprint {
  message: string
}

export interface ExportBlueprintResult {
  format: string
  message: string
  outputDir: string
  files: Record<string, number>
}

export interface ExecuteBlueprintResult {
  action: 'launch' | 'status' | 'resume' | 'stop' | 'logs'
  backend: string
  executionId: string
  artifactPaths?: string[]
  bridgePath?: string
  launchSpec?: BlueprintExecutionSpec
  logPath?: string
  message: string
  output: string
  runtimeSnapshotPath?: string
  slug: string
  status: string
  teamStateRoot?: string
}

function assertBlueprintCanMoveToStatus(blueprint: Blueprint, nextStatus: BlueprintStatus): void {
  if (nextStatus !== 'completed') {
    return
  }

  const validation = validateAllTasksDone(blueprint)
  if (!validation.valid) {
    throw new Error(
      [
        `Blueprint ${blueprint.name} cannot move to completed.`,
        validation.message ?? 'Incomplete tasks remain.',
      ].join('\n'),
    )
  }
}

/**
 * Resolve the blueprint-template path.
 *
 * Two strategies, tried in order:
 *   1. If a repo-root marker (`pnpm-workspace.yaml`) is found upward from
 *      `import.meta.dirname`, use `<repoRoot>/docs/templates/blueprint.md`.
 *      This keeps the wp-style lookup working when webpresso is consumed
 *      inside the webpresso monorepo.
 *   2. Otherwise, fall back to the template bundled inside this package at
 *      `catalog/docs/templates/blueprint.md`. Allows consumers to run the
 *      CLI outside a pnpm workspace without supplying `--template-path`.
 *
 * Resolution is lazy — returns a function so we don't throw at module load
 * when the lookup fails in unrelated contexts (e.g. `wp --help`).
 */
function resolveRepoBlueprintTemplatePath(): string {
  return resolvePackageAssetPreferred([
    'docs/templates/blueprint.md',
    'catalog/docs/templates/blueprint.md',
  ])
}

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0] ?? new Date().toISOString()
}

function nowIsoTimestamp(): string {
  return new Date().toISOString()
}

function resolveProjectRoot(projectRoot?: string): string {
  return projectRoot ?? getProjectRoot()
}

function normalizeBlueprintComplexity(complexity?: string): PlanComplexity {
  if (!complexity) {
    throw new Error('Usage: wp blueprint new "<goal>" --complexity <XS|S|M|L|XL>')
  }

  const parsed = complexitySchema.safeParse(complexity)
  if (!parsed.success) {
    throw new Error(
      `Invalid blueprint complexity: ${complexity}. Valid values: ${complexitySchema.options.join(', ')}`,
    )
  }

  return parsed.data
}

function normalizeBlueprintStatus(status: string): BlueprintStatus {
  const parsed = planStatusSchema.safeParse(status)
  if (!parsed.success) {
    throw new Error(
      `Invalid blueprint status: ${status}. Valid statuses: ${planStatusSchema.options.join(', ')}`,
    )
  }

  return parsed.data
}

function readStagedFiles(projectRoot: string): string[] {
  const stdout = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    cwd: projectRoot,
    encoding: 'utf-8',
  })
  return stdout
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0)
}

async function resolveBlueprintLocation(
  slug: string,
  projectRoot: string,
): Promise<ResolvedBlueprintLocation> {
  const match = await resolveBlueprintFile(projectRoot, slug)
  const raw = await readFile(match.path, 'utf-8')

  return {
    blueprint: parseBlueprint(raw, match.slug),
    path: match.path,
    slug: match.slug,
  }
}

async function writeBlueprintWithStatus(
  blueprintPath: string,
  blueprint: Blueprint,
  status: BlueprintStatus,
): Promise<boolean> {
  if (blueprint.status === status) {
    return false
  }

  const updatedBlueprint: Blueprint = {
    ...blueprint,
    lastUpdated: todayIsoDate(),
    status,
  }
  const serialized = serializeBlueprint(updatedBlueprint)
  await writeFile(blueprintPath, serialized, 'utf-8')
  return true
}

async function applyLifecycleMutation(
  slug: string,
  intent: BlueprintLifecycleIntent,
  projectRoot: string,
): Promise<BlueprintLifecycleMutationResult> {
  const mutation = await applyBlueprintLifecycleToFile(projectRoot, slug, intent)

  return {
    message: `Updated blueprint ${mutation.slug} to ${mutation.targetStatus}.`,
    moved: mutation.moved,
    progress: mutation.progress,
    slug: mutation.slug,
    status: mutation.targetStatus,
    ...('taskId' in intent ? { taskId: intent.taskId } : {}),
  }
}

export async function listBlueprints(
  options: BlueprintListOptions = {},
): Promise<BlueprintSummary[]> {
  const projectRoot = resolveProjectRoot(options.projectRoot)
  const service = new BlueprintService(projectRoot)
  const summaries = await service.list()
  const filteredByType = options.onlyRoadmaps
    ? summaries.filter((summary) => summary.type === 'parent-roadmap')
    : summaries

  if (!options.status) {
    return filteredByType.toSorted(compareBlueprintSummaries)
  }

  const status = normalizeBlueprintStatus(options.status)
  return filteredByType
    .filter((summary) => summary.status === status)
    .toSorted(compareBlueprintSummaries)
}

function compareBlueprintSummaries(left: BlueprintSummary, right: BlueprintSummary): number {
  const leftRank = left.type === 'parent-roadmap' ? 0 : 1
  const rightRank = right.type === 'parent-roadmap' ? 0 : 1
  return leftRank - rightRank || left.name.localeCompare(right.name)
}

export async function showBlueprint(
  slug: string,
  options: BlueprintShowOptions = {},
): Promise<ShowBlueprintResult> {
  const projectRoot = resolveProjectRoot(options.projectRoot)
  const location = await resolveBlueprintLocation(slug, projectRoot)

  return {
    blueprint: location.blueprint,
    location: {
      path: location.path,
      projectRoot,
    },
    slug: location.slug,
  }
}

export async function createBlueprint(
  goal: string,
  options: BlueprintNewOptions = {},
): Promise<CreateBlueprintResult> {
  const projectRoot = resolveProjectRoot(options.projectRoot)
  const complexity = normalizeBlueprintComplexity(options.complexity)
  const type = normalizeBlueprintType(options.type)
  const service = new BlueprintCreationService(projectRoot, {
    templatePath: options.templatePath ?? resolveRepoBlueprintTemplatePath(),
  })
  const created = await service.create({ complexity, goal, type })

  return {
    ...created,
    message: `Created ${created.type} draft/${created.slug}.`,
  }
}

function normalizeBlueprintType(type?: string): BlueprintDocumentType {
  if (!type) return 'blueprint'
  if (type === 'blueprint' || type === 'parent-roadmap') return type
  throw new Error(`Invalid blueprint type: ${type}. Valid types: blueprint, parent-roadmap`)
}

export async function executeBlueprint(
  slug: string,
  options: BlueprintMoveOptions = {},
): Promise<ExecuteBlueprintResult> {
  const projectRoot = resolveProjectRoot(options.projectRoot)
  const started = await startBlueprint(slug, { projectRoot })
  const location = await resolveBlueprintLocation(started.slug, projectRoot)
  const relativeBlueprintPath = path.relative(projectRoot, location.path).replace(/\\/g, '/')
  const launchSpec = buildBlueprintLaunchSpec({
    blueprint: location.blueprint,
    blueprintPath: relativeBlueprintPath,
    blueprintSlug: location.slug,
  })
  const launched = launchBlueprintExecution(launchSpec, projectRoot)
  try {
    await initializeBlueprintExecutionProgressBridge(launchSpec, launched.executionId, projectRoot)
  } catch (error) {
    try {
      controlBlueprintExecution(launchSpec.backend, 'stop', launched.executionId, projectRoot)
    } catch {
      // Best effort cleanup only.
    }

    return recordLaunchFailure(
      location.path,
      projectRoot,
      launchSpec.backend,
      launched.executionId,
      `Failed to initialize blueprint execution progress bridge: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  await persistBlueprintExecutionMetadata(location.path, {
    backend: launchSpec.backend,
    executionId: launched.executionId,
    status: 'running',
    updatedAt: nowIsoTimestamp(),
  })
  await writeBlueprintRuntimeSnapshot(projectRoot, {
    backend: launchSpec.backend,
    executionId: launched.executionId,
    status: 'running',
    updatedAt: nowIsoTimestamp(),
  })
  const runtime = await describeBlueprintExecutionRuntime(location.path)
  await persistBlueprintExecutionArtifacts(location.path, {
    artifacts: runtime.paths.artifactPaths,
    logPath: runtime.paths.logPath,
    verifications: [],
  })

  return {
    action: 'launch',
    artifactPaths: runtime.paths.artifactPaths,
    backend: launched.backend,
    bridgePath: runtime.paths.bridgePath,
    executionId: launched.executionId,
    launchSpec,
    logPath: runtime.paths.logPath,
    message: `Launched blueprint ${started.slug} via ${launched.backend}.`,
    output: launched.output,
    runtimeSnapshotPath: runtime.paths.runtimeSnapshotPath,
    slug: started.slug,
    status: runtime.status,
    teamStateRoot: runtime.paths.teamStateRoot,
  }
}

export async function controlBlueprintExec(
  action: 'status' | 'resume' | 'stop',
  slug: string,
  options: BlueprintMoveOptions = {},
): Promise<ExecuteBlueprintResult> {
  const projectRoot = resolveProjectRoot(options.projectRoot)
  const location = await resolveBlueprintLocation(slug, projectRoot)
  const metadata = await readBlueprintExecutionState(location.path)

  if (!metadata) {
    throw new Error(
      `Blueprint ${location.slug} has no stored execution metadata. Launch it with wp blueprint exec <slug> first.`,
    )
  }

  if (action === 'stop') {
    const control = controlBlueprintExecution(
      metadata.backend,
      action,
      metadata.executionId,
      projectRoot,
    )
    await writeBlueprintRuntimeSnapshot(projectRoot, {
      backend: metadata.backend,
      executionId: metadata.executionId,
      status: 'stopped',
      updatedAt: nowIsoTimestamp(),
    })
    const evidence = await buildStoppedRuntimeEvidence(location.path)
    const reconciled = await reconcileBlueprintRuntimeSnapshot(
      projectRoot,
      location.path,
      location.slug,
      {
        backend: metadata.backend,
        executionId: metadata.executionId,
        status: 'stopped',
        updatedAt: nowIsoTimestamp(),
      },
      evidence,
    )
    const runtime = await describeBlueprintExecutionRuntime(reconciled.path)

    return {
      action,
      artifactPaths: runtime.paths.artifactPaths,
      backend: metadata.backend,
      bridgePath: runtime.paths.bridgePath,
      executionId: metadata.executionId,
      logPath: runtime.paths.logPath,
      message: `Stopped blueprint ${location.slug} via ${metadata.backend}.`,
      output: control.output,
      runtimeSnapshotPath: runtime.paths.runtimeSnapshotPath,
      slug: location.slug,
      status: runtime.status,
      teamStateRoot: runtime.paths.teamStateRoot,
    }
  }

  const control = controlBlueprintExecution(
    metadata.backend,
    action,
    metadata.executionId,
    projectRoot,
  )
  const sync = await syncBlueprintExecutionProgress(location.path, location.slug, projectRoot, {
    evidence:
      action === 'status'
        ? {
            artifacts: [],
            verifications: [`omx team status ${metadata.executionId}`],
          }
        : undefined,
  })
  const runtime = await describeBlueprintExecutionRuntime(sync.blueprintPath)

  return {
    action,
    artifactPaths: runtime.paths.artifactPaths,
    backend: metadata.backend,
    bridgePath: runtime.paths.bridgePath,
    executionId: metadata.executionId,
    logPath: runtime.paths.logPath,
    message: `${action === 'resume' ? 'Resumed' : 'Checked'} blueprint ${location.slug} via ${metadata.backend}.`,
    output: control.output,
    runtimeSnapshotPath: runtime.paths.runtimeSnapshotPath,
    slug: location.slug,
    status: sync.status,
    teamStateRoot: runtime.paths.teamStateRoot,
  }
}

export async function readBlueprintExecutionLogs(
  slug: string,
  options: BlueprintMoveOptions = {},
): Promise<ExecuteBlueprintResult> {
  const projectRoot = resolveProjectRoot(options.projectRoot)
  const location = await resolveBlueprintLocation(slug, projectRoot)
  const runtime = await describeBlueprintExecutionRuntime(location.path)

  return {
    action: 'logs',
    artifactPaths: runtime.paths.artifactPaths,
    backend: runtime.backend,
    bridgePath: runtime.paths.bridgePath,
    executionId: runtime.executionId,
    logPath: runtime.paths.logPath,
    message: `Execution runtime paths for blueprint ${location.slug}.`,
    output: '',
    runtimeSnapshotPath: runtime.paths.runtimeSnapshotPath,
    slug: location.slug,
    status: runtime.status,
    teamStateRoot: runtime.paths.teamStateRoot,
  }
}

export async function moveBlueprint(
  slug: string,
  status: string,
  options: BlueprintMoveOptions = {},
): Promise<MoveBlueprintResult> {
  const projectRoot = resolveProjectRoot(options.projectRoot)
  const nextStatus = normalizeBlueprintStatus(status)
  const location = await resolveBlueprintLocation(slug, projectRoot)
  const isFlatFile = path.basename(location.path) !== '_overview.md'
  const sourceDir = path.dirname(location.path)
  const targetPaths = getBlueprintDocumentPaths(
    resolveBlueprintRoot(projectRoot),
    nextStatus,
    relativeBlueprintSlug(location.slug),
  )
  const targetDir = targetPaths.directory
  const targetPath = isFlatFile ? targetPaths.flat : targetPaths.folder

  if (location.path === targetPath && location.blueprint.status === nextStatus) {
    return {
      fromPath: location.path,
      fromStatus: location.blueprint.status,
      message: `Blueprint ${location.slug} is already in ${nextStatus}.`,
      moved: false,
      slug: location.slug,
      toPath: location.path,
      toStatus: nextStatus,
      updated: false,
    }
  }

  if (!options.forceRecovery) {
    throw new Error(
      'Blueprint move is recovery-only. Use wp blueprint start/task/finalize for normal lifecycle changes, or pass --force-recovery.',
    )
  }

  assertBlueprintCanMoveToStatus(location.blueprint, nextStatus)

  if (location.path !== targetPath) {
    await mkdir(path.dirname(targetPath), { recursive: true })
    await rename(isFlatFile ? location.path : sourceDir, isFlatFile ? targetPath : targetDir)
  }

  const updated = await writeBlueprintWithStatus(targetPath, location.blueprint, nextStatus)

  return {
    fromPath: location.path,
    fromStatus: location.blueprint.status,
    message:
      location.path === targetPath
        ? `Updated blueprint ${location.slug} to ${nextStatus}.`
        : `Moved blueprint ${location.slug} to ${nextStatus}.`,
    moved: location.path !== targetPath,
    slug: location.slug,
    toPath: targetPath,
    toStatus: nextStatus,
    updated,
  }
}

export async function startBlueprint(
  slug: string,
  options: BlueprintMoveOptions = {},
): Promise<BlueprintLifecycleMutationResult> {
  const projectRoot = resolveProjectRoot(options.projectRoot)
  const binding = ensureBlueprintOwnerWorktree(projectRoot, relativeBlueprintSlug(slug))
  const result = await applyLifecycleMutation(
    slug,
    {
      type: 'start',
      worktreeOwnerId: binding.id,
      worktreeOwnerBranch: binding.branch,
    },
    projectRoot,
  )
  return {
    ...result,
    message: `${result.message} Owner worktree: ${binding.path}`,
  }
}

export async function parkBlueprint(
  slug: string,
  options: BlueprintMoveOptions = {},
): Promise<BlueprintLifecycleMutationResult> {
  const projectRoot = resolveProjectRoot(options.projectRoot)
  const result = await applyLifecycleMutation(slug, { type: 'park' }, projectRoot)
  clearBlueprintWorktreeOwnership(projectRoot, relativeBlueprintSlug(slug))
  return result
}

export async function finalizeBlueprint(
  slug: string,
  options: BlueprintMoveOptions = {},
): Promise<BlueprintLifecycleMutationResult> {
  const projectRoot = resolveProjectRoot(options.projectRoot)
  const result = await applyLifecycleMutation(slug, { type: 'finalize' }, projectRoot)
  clearBlueprintWorktreeOwnership(projectRoot, relativeBlueprintSlug(slug))
  return result
}

export async function mutateBlueprintTask(
  action: 'start' | 'block' | 'unblock' | 'complete',
  slug: string,
  taskId: string,
  options: BlueprintMoveOptions & { reason?: string } = {},
): Promise<BlueprintLifecycleMutationResult> {
  const projectRoot = resolveProjectRoot(options.projectRoot)
  const intent: BlueprintLifecycleIntent =
    action === 'start'
      ? { type: 'task_start', taskId }
      : action === 'block'
        ? { type: 'task_block', taskId, reason: options.reason ?? '' }
        : action === 'unblock'
          ? { type: 'task_unblock', taskId }
          : { type: 'task_complete', taskId }

  return applyLifecycleMutation(slug, intent, projectRoot)
}

export async function auditBlueprints(
  options: BlueprintAuditOptions = {},
): Promise<BlueprintAuditResult> {
  const projectRoot = resolveProjectRoot(options.projectRoot)
  const stagedFiles = options.staged ? readStagedFiles(projectRoot) : undefined
  return runBlueprintAudit({
    all: options.all ?? !options.staged,
    projectRoot,
    stagedFiles,
    strict: options.strict,
  })
}

export async function exportBlueprint(
  slug: string,
  format: string,
  options: BlueprintMoveOptions = {},
): Promise<ExportBlueprintResult> {
  const projectRoot = resolveProjectRoot(options.projectRoot)
  const location = await resolveBlueprintLocation(slug, projectRoot)
  const raw = await readFile(location.path, 'utf-8')
  const parsed = parseBlueprintForDb(raw, location.path, location.slug)

  const bundle = blueprintToSpecKit(parsed, projectRoot)
  const outDir = path.join(path.dirname(location.path), 'spec-kit')
  await mkdir(outDir, { recursive: true })

  const fileMap: Record<string, string> = {
    'spec.md': bundle.spec,
    'plan.md': bundle.plan,
    'tasks.md': bundle.tasks,
    'constitution.md': bundle.constitution,
  }

  const sizes: Record<string, number> = {}
  for (const [name, content] of Object.entries(fileMap)) {
    const dest = path.join(outDir, name)
    await writeFile(dest, content, 'utf-8')
    sizes[name] = Buffer.byteLength(content, 'utf-8')
  }

  const rel = path.relative(projectRoot, outDir)
  return {
    format,
    message: `Exported to ${rel}/`,
    outputDir: outDir,
    files: sizes,
  }
}

export async function advanceBlueprintTask(
  slug: string,
  taskId: string,
  toStatus: string,
  options: BlueprintMoveOptions = {},
): Promise<AdvanceTaskResult> {
  const projectRoot = resolveProjectRoot(options.projectRoot)
  const VALID_STATUSES = ['todo', 'in-progress', 'blocked', 'done', 'dropped'] as const
  type ValidStatus = (typeof VALID_STATUSES)[number]
  const isValid = (s: string): s is ValidStatus => (VALID_STATUSES as readonly string[]).includes(s)
  if (!isValid(toStatus)) {
    throw new Error(`Invalid task status: ${toStatus}. Valid values: ${VALID_STATUSES.join(', ')}`)
  }
  return advanceTaskMutation(projectRoot, slug, taskId, toStatus)
}

export async function promoteBlueprintToState(
  slug: string,
  toState: string,
  options: BlueprintMoveOptions = {},
): Promise<PromoteBlueprintResult> {
  const projectRoot = resolveProjectRoot(options.projectRoot)
  const VALID_STATES = ['planned', 'in-progress', 'completed', 'parked'] as const
  type ValidState = (typeof VALID_STATES)[number]
  const isValid = (s: string): s is ValidState => (VALID_STATES as readonly string[]).includes(s)
  if (!isValid(toState)) {
    throw new Error(`Invalid blueprint state: ${toState}. Valid values: ${VALID_STATES.join(', ')}`)
  }
  return promoteBlueprintMutation(projectRoot, slug, toState)
}

export async function finalizeBlueprintBySlug(
  slug: string,
  options: BlueprintMoveOptions = {},
): Promise<PromoteBlueprintResult> {
  const projectRoot = resolveProjectRoot(options.projectRoot)
  return finalizeBlueprintMutation(projectRoot, slug)
}

export function registerBlueprintRouter(cli: CAC): void {
  cli
    .command(
      'blueprint [subcommand] [...args]',
      'Manage blueprints. Use: wp blueprint <action> --help for action-specific options (new, list, show, audit, exec, move, finalize, start, task)',
    )
    .option('--json', 'Print JSON output')
    .option('--no-tui', 'Use plain terminal output')
    .option('--complexity <complexity>', 'Blueprint complexity (XS|S|M|L|XL)')
    .option('--type <type>', 'Blueprint type (blueprint|parent-roadmap)')
    .option('--format <format>', 'Export format (spec-kit)')
    .option('--force-recovery', 'Bypass lifecycle guards for blueprint move')
    .option('--reason <text>', 'Blocked reason for task block')
    .option('--params <json>', 'JSON params for wp blueprint db query')
    .option(
      '--to <status>',
      'Target status for task advance (todo|in-progress|blocked|done|dropped)',
    )
    .option('--staged', 'Audit only staged files')
    .option('--all', 'Audit all blueprints')
    .option('--strict', 'Enable strict audit mode')
    .option(
      '--template <name>',
      'Template name to scaffold new blueprint from (see --list-templates)',
    )
    .option('--list-templates', 'List available template names and exit')
    .option('--templates-dir <path>', 'Override the templates directory (default: docs/templates/)')
    .action(
      async (subcommand: string | undefined, args: string[], options: BlueprintCommandOptions) => {
        try {
          await executeBlueprintSubcommand(subcommand, args, options, {
            advanceBlueprintTask,
            auditBlueprints,
            createBlueprint,
            controlBlueprintExec,
            executeBlueprint,
            exportBlueprint,
            finalizeBlueprint,
            finalizeBlueprintBySlug,
            formatBlueprintAudit,
            formatBlueprintCreation,
            formatBlueprintDetails,
            formatBlueprintExecution,
            formatBlueprintSummaries,
            getHelpText: getBlueprintHelpText,
            listBlueprints,
            moveBlueprint,
            mutateBlueprintTask,
            parkBlueprint,
            printBlueprintOutput,
            promoteBlueprintToState,
            readBlueprintExecutionLogs,
            showBlueprint,
            startBlueprint,
          })
        } catch (error) {
          if (error instanceof BlueprintAuditFailedError) {
            process.exit(1)
          }
          handleBlueprintError(error)
        }
      },
    )
}
