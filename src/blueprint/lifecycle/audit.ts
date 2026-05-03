import type { Blueprint } from '#core/parser'

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { parseBlueprint } from '#core/parser'
import { lifecycleBlueprintStatusSchema } from '#core/schema'
import { readBlueprintExecutionArtifacts } from '#execution/artifacts'
import { readBlueprintExecutionMetadata } from '#execution/metadata'
import { BlueprintService } from '#service/BlueprintService'
import { scanBlueprintDirectory } from '#service/scanner'

import { relativeBlueprintSlug } from './local.js'

export interface BlueprintAuditIssue {
  file?: string
  level: 'error' | 'warning'
  message: string
}

export interface BlueprintAuditResult {
  issues: BlueprintAuditIssue[]
  ok: boolean
}

export interface RunBlueprintAuditOptions {
  all?: boolean
  projectRoot: string
  stagedFiles?: string[]
  strict?: boolean
}

function isBlueprintOverview(file: string): boolean {
  const normalized = file.replace(/\\/g, '/')
  return (
    normalized.endsWith('/_overview.md') &&
    (normalized.includes('webpresso/blueprints/') || normalized.includes('blueprints/'))
  )
}

function normalizePath(file: string): string {
  return file.replace(/\\/g, '/')
}

function readTaskStatusLines(raw: string): Map<string, string | undefined> {
  const taskBlocks = raw.split(/^####\s+(?:\[[^\]]+\]\s+)?Task\s+/m).slice(1)
  const result = new Map<string, string | undefined>()

  for (const block of taskBlocks) {
    const idMatch = block.match(/^(\d+(?:\.\d+)+):/)
    if (!idMatch?.[1]) continue
    const statusMatch = block.match(/\*\*Status:\*\*\s*(.+)/i)
    result.set(idMatch[1], statusMatch?.[1]?.trim())
  }

  return result
}

function validateTaskState(blueprint: Blueprint): BlueprintAuditIssue[] {
  const issues: BlueprintAuditIssue[] = []
  const explicitStatuses = readTaskStatusLines(blueprint.raw)

  for (const task of blueprint.tasks) {
    const explicitStatus = explicitStatuses.get(task.id)
    if (!explicitStatus) {
      issues.push({
        level: 'error',
        message: `Task ${task.id} has no **Status:** line (only checkboxes); add explicit **Status:**.`,
      })
      continue
    }

    if (!lifecycleTaskStatuses.has(explicitStatus)) {
      issues.push({
        level: 'error',
        message: `Task ${task.id} has invalid status "${explicitStatus}".`,
      })
    }

    const { checked, total } = task.acceptanceCriteria
    if (task.status === 'done' && total > 0 && checked !== total) {
      issues.push({
        level: 'error',
        message: `Task ${task.id} is done but acceptance is ${checked}/${total}.`,
      })
    }
    if (task.status === 'blocked' && !task.blockedReason?.trim()) {
      issues.push({
        level: 'error',
        message: `Task ${task.id} is blocked but missing **Blocked:** reason.`,
      })
    }
    if (task.status !== 'blocked' && task.blockedReason?.trim()) {
      issues.push({
        level: 'error',
        message: `Task ${task.id} has blocked reason but status ${task.status}.`,
      })
    }
  }

  return issues
}

function validateBlueprintSlugUniqueness(
  blueprints: Array<{ path: string; slug: string }>,
): BlueprintAuditIssue[] {
  const grouped = new Map<string, Array<{ file: string; slug: string }>>()

  for (const blueprint of blueprints) {
    const normalizedSlug = relativeBlueprintSlug(blueprint.slug)
    const existing = grouped.get(normalizedSlug)
    if (existing) {
      existing.push({ file: blueprint.path, slug: blueprint.slug })
    } else {
      grouped.set(normalizedSlug, [{ file: blueprint.path, slug: blueprint.slug }])
    }
  }

  const issues: BlueprintAuditIssue[] = []

  for (const [normalizedSlug, entries] of grouped) {
    const uniqueLifecycleSlugs = new Set(entries.map((entry) => entry.slug))
    if (uniqueLifecycleSlugs.size <= 1) continue

    issues.push({
      file: entries[0]?.file,
      level: 'error',
      message: `Blueprint slug "${normalizedSlug}" appears in multiple lifecycle locations: ${Array.from(
        uniqueLifecycleSlugs,
      )
        .toSorted()
        .join(', ')}.`,
    })
  }

  return issues
}

/**
 * Enforce engine semantics: `completed` implies every task is `done`
 * (per-task acceptance is enforced separately). Blocked tasks use task-level status only.
 */
function validateBlueprintEngineSemantics(
  file: string,
  blueprint: Blueprint,
): BlueprintAuditIssue[] {
  const issues: BlueprintAuditIssue[] = []

  if (blueprint.status === 'completed') {
    for (const task of blueprint.tasks) {
      if (task.status !== 'done') {
        issues.push({
          file,
          level: 'error',
          message: `Blueprint status is completed but task ${task.id} is "${task.status}" (expected "done").`,
        })
      }
    }
  }

  return issues
}

function validateExecutionMetadataTruth(file: string, blueprint: Blueprint): BlueprintAuditIssue[] {
  const issues: BlueprintAuditIssue[] = []
  const metadata = readBlueprintExecutionMetadata(blueprint.raw)
  const artifacts = readBlueprintExecutionArtifacts(blueprint.raw)
  const executionFieldCount = Array.from(
    blueprint.raw.matchAll(/^\s*execution_(backend|id|status|updated_at):/gm),
  ).length
  const executionArtifactFieldCount = Array.from(
    blueprint.raw.matchAll(/^\s*execution_(verifications|artifacts|log_path):/gm),
  ).length

  if (!metadata) {
    if (executionFieldCount > 0) {
      issues.push({
        file,
        level: 'error',
        message:
          'Blueprint execution metadata is partially populated; backend, id, status, and updated_at must all be present together.',
      })
    }
    if (executionArtifactFieldCount > 0) {
      issues.push({
        file,
        level: 'error',
        message:
          'Blueprint execution artifacts are populated without canonical execution metadata.',
      })
    }
    return issues
  }

  if (
    metadata.status === 'running' &&
    (blueprint.status === 'draft' ||
      blueprint.status === 'planned' ||
      blueprint.status === 'parked')
  ) {
    issues.push({
      file,
      level: 'error',
      message: `Blueprint execution is ${metadata.status} but blueprint status is ${blueprint.status}; runtime-backed work must move the blueprint into in-progress.`,
    })
  }

  if (metadata.status === 'completed') {
    const incompleteTasks = blueprint.tasks.filter((task) => task.status !== 'done')
    if (blueprint.status !== 'completed') {
      issues.push({
        file,
        level: 'error',
        message: 'Blueprint execution is completed but blueprint status is not completed.',
      })
    }
    if (incompleteTasks.length > 0) {
      issues.push({
        file,
        level: 'error',
        message: `Blueprint execution is completed but tasks remain unfinished: ${incompleteTasks.map((task) => task.id).join(', ')}.`,
      })
    }
    if (!artifacts || artifacts.verifications.length === 0) {
      issues.push({
        file,
        level: 'error',
        message: 'Blueprint execution is completed but named verification output is missing.',
      })
    }
    if (!artifacts || (artifacts.artifacts.length === 0 && !artifacts.logPath)) {
      issues.push({
        file,
        level: 'error',
        message: 'Blueprint execution is completed but artifact or log identity is missing.',
      })
    }
  }

  if (
    (metadata.status === 'blocked' ||
      metadata.status === 'failed' ||
      metadata.status === 'stopped') &&
    blueprint.status === 'completed'
  ) {
    issues.push({
      file,
      level: 'error',
      message: `Blueprint execution is ${metadata.status} but blueprint is marked completed.`,
    })
  }

  if (
    (metadata.status === 'blocked' || metadata.status === 'failed') &&
    blueprint.tasks.length > 0 &&
    blueprint.tasks.every((task) => task.status === 'done')
  ) {
    issues.push({
      file,
      level: 'error',
      message: `Blueprint execution is ${metadata.status} but every task is marked done; failed or blocked runtime work must not appear completed.`,
    })
  }

  return issues
}

const lifecycleTaskStatuses = new Set(['todo', 'in_progress', 'blocked', 'done'])

function validateBlueprintPlacement(file: string, blueprint: Blueprint): BlueprintAuditIssue[] {
  const issues: BlueprintAuditIssue[] = []
  const normalized = normalizePath(file)
  // Try both layouts (webpresso legacy + generic).
  const folderStatus =
    normalized.split('/webpresso/blueprints/')[1]?.split('/')[0] ??
    normalized.split('/blueprints/')[1]?.split('/')[0]
  if (!folderStatus) return issues

  if (!lifecycleBlueprintStatusSchema.safeParse(blueprint.status).success) {
    issues.push({
      file,
      level: 'error',
      message: `Blueprint status "${blueprint.status}" is not in the executable lifecycle.`,
    })
    return issues
  }

  if (folderStatus !== blueprint.status) {
    issues.push({
      file,
      level: 'error',
      message: `Blueprint folder/status mismatch: folder=${folderStatus} frontmatter=${blueprint.status}.`,
    })
  }

  return issues
}

async function auditBlueprintFile(file: string, slug: string): Promise<BlueprintAuditIssue[]> {
  const raw = await readFile(file, 'utf-8')
  const blueprint = parseBlueprint(raw, slug)
  return [
    ...validateBlueprintPlacement(file, blueprint),
    ...validateTaskState(blueprint).map((issue) => Object.assign({}, issue, { file })),
    ...validateBlueprintEngineSemantics(file, blueprint),
    ...validateExecutionMetadataTruth(file, blueprint),
  ]
}

function validatePllDocs(docs: Array<{ file: string; raw: string }>): BlueprintAuditIssue[] {
  const issues: BlueprintAuditIssue[] = []

  for (const doc of docs) {
    if (/just wp blueprint move <slug> in-progress/i.test(doc.raw)) {
      issues.push({
        file: doc.file,
        level: 'error',
        message: 'PLL docs still instruct direct blueprint move commands for normal execution.',
      })
    }
    if (/just wp blueprint run <slug>/i.test(doc.raw)) {
      issues.push({
        file: doc.file,
        level: 'error',
        message: 'PLL docs still claim a nonexistent `wp blueprint run` execution surface.',
      })
    }
    if (/blueprint-orchestrator/i.test(doc.raw)) {
      issues.push({
        file: doc.file,
        level: 'error',
        message: 'PLL docs still reference a removed local blueprint orchestrator.',
      })
    }
    if (/blueprint plans|combined-dag/i.test(doc.raw)) {
      issues.push({
        file: doc.file,
        level: 'error',
        message: 'PLL docs still reference unshipped cross-blueprint execution commands.',
      })
    }
    if (/TaskUpdate\(taskId=task\.id,\s*status="completed"\)/i.test(doc.raw)) {
      issues.push({
        file: doc.file,
        level: 'error',
        message: 'PLL docs still mark failed tasks as completed in pseudocode.',
      })
    }
  }

  return issues
}

async function auditStageCoherence(
  projectRoot: string,
  stagedFiles: string[],
): Promise<BlueprintAuditIssue[]> {
  const normalizedFiles = stagedFiles.map(normalizePath)
  const stagedBlueprints = new Set(normalizedFiles.filter(isBlueprintOverview))
  const stagedCodeFiles = normalizedFiles.filter(
    (file) =>
      !file.startsWith('.agent/') &&
      !isBlueprintOverview(file) &&
      !file.startsWith('webpresso/blueprints/') &&
      !file.startsWith('blueprints/') &&
      !file.endsWith('.md'),
  )

  if (!stagedCodeFiles.length) {
    return []
  }

  const service = new BlueprintService(projectRoot)
  const active = (
    await service.query({
      filters: { status: ['planned', 'in-progress'] },
    })
  ).plans

  const issues: BlueprintAuditIssue[] = []
  for (const file of stagedCodeFiles) {
    const matching = active.filter((plan) => plan.filesTouched.includes(file))
    if (!matching.length) {
      continue
    }

    const matchingPaths = matching.map((plan) =>
      normalizePath(path.relative(projectRoot, plan.path)),
    )
    const hasBlueprintUpdate = matchingPaths.some((planPath) => stagedBlueprints.has(planPath))
    if (hasBlueprintUpdate) {
      continue
    }
    if (isSharedHotFile(file)) {
      // Shared/cross-cutting manifest files (package.json, lockfiles, workspace
      // descriptors) are touched by many independent agents and routinely show
      // up in active blueprints' filesTouched. Demote to a non-blocking warning
      // so unrelated dep bumps and lockfile refreshes aren't gated on a
      // blueprint they happen to overlap with.
      issues.push({
        file,
        level: 'warning',
        message: `Shared file ${file} matches blueprint filesTouched (${matchingPaths.join(', ')}); cross-cutting changes don't require a blueprint overview update.`,
      })
      continue
    }
    issues.push({
      file,
      level: 'error',
      message: `Staged file ${file} matches blueprint filesTouched but no corresponding blueprint overview is staged.`,
    })
  }

  return issues
}

/**
 * Files routinely touched by unrelated dep bumps, lockfile refreshes, and
 * workspace-wide tooling changes. Stage-coherence on these never blocks.
 */
const SHARED_HOT_FILE_PATTERNS: RegExp[] = [
  /(?:^|\/)package\.json$/,
  /^pnpm-workspace\.yaml$/,
  /^pnpm-lock\.yaml$/,
]

function isSharedHotFile(file: string): boolean {
  return SHARED_HOT_FILE_PATTERNS.some((pattern) => pattern.test(file))
}

export async function runBlueprintAudit(
  options: RunBlueprintAuditOptions,
): Promise<BlueprintAuditResult> {
  const issues: BlueprintAuditIssue[] = []
  const scanned = scanBlueprintDirectory({
    baseDir: path.join(options.projectRoot, 'webpresso', 'blueprints'),
    includeSpecialFolders: true,
  })

  const blueprintFiles =
    options.all || !options.stagedFiles
      ? scanned
      : scanned.filter((entry) =>
          new Set(options.stagedFiles?.map(normalizePath) ?? []).has(
            normalizePath(path.relative(options.projectRoot, entry.path)),
          ),
        )

  issues.push(...validateBlueprintSlugUniqueness(blueprintFiles))
  for (const entry of blueprintFiles) {
    issues.push(...(await auditBlueprintFile(entry.path, entry.slug)))
  }

  const pllDocs = [
    path.join(options.projectRoot, '.agent', 'commands', 'pll.md'),
    path.join(options.projectRoot, '.agent', 'skills', 'pll', 'SKILL.md'),
    path.join(options.projectRoot, '.agent', 'guides', 'parallel-execution.md'),
  ]

  const docsPayload = await Promise.all(
    pllDocs.map(async (file) => {
      try {
        return {
          file,
          raw: await readFile(file, 'utf-8'),
        }
      } catch {
        return null
      }
    }),
  )
  issues.push(
    ...validatePllDocs(
      docsPayload.filter((entry): entry is { file: string; raw: string } => entry !== null),
    ),
  )

  if (options.stagedFiles) {
    issues.push(...(await auditStageCoherence(options.projectRoot, options.stagedFiles)))
  }

  const strictIssues = options.strict ? issues : issues.filter((issue) => issue.level === 'error')

  return {
    issues,
    ok: strictIssues.filter((issue) => issue.level === 'error').length === 0,
  }
}
