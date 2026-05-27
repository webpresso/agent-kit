import type { Blueprint } from '#core/parser'
import type { LifecycleBlueprintStatus } from '#core/schema'

import matter from 'gray-matter'

import { parseBlueprint } from '#core/parser'
import { lifecycleBlueprintStatusSchema } from '#core/schema'
import { completeTask, updateBlockedReason, updateTaskStatus } from '#markdown/helpers'

export type LifecycleTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'

export type BlueprintLifecycleIntent =
  | { type: 'start' }
  | { type: 'park' }
  | { type: 'finalize' }
  | { type: 'task_start'; taskId: string }
  | { type: 'task_block'; taskId: string; reason: string }
  | { type: 'task_unblock'; taskId: string }
  | { type: 'task_complete'; taskId: string }

export interface BlueprintLifecycleResult {
  auditEvents: string[]
  blueprint: Blueprint
  markdown: string
  progress: string
  targetStatus: LifecycleBlueprintStatus
}

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0] ?? new Date().toISOString()
}

export function setBlueprintFrontmatterFields(
  markdown: string,
  updates: Record<string, string | string[] | undefined>,
): string {
  const parsed = matter(markdown)
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === '') {
      delete parsed.data[key]
    } else {
      parsed.data[key] = value
    }
  }
  return matter.stringify(parsed.content, parsed.data)
}

function assertExecutableStatus(status: string): LifecycleBlueprintStatus {
  const parsed = lifecycleBlueprintStatusSchema.safeParse(status)
  if (!parsed.success) {
    throw new Error(
      `Blueprint status "${status}" is not executable. Normalize it to one of: ${lifecycleBlueprintStatusSchema.options.join(', ')}`,
    )
  }
  return parsed.data
}

function formatProgress(blueprint: Blueprint): string {
  const total = blueprint.tasks.length
  const done = blueprint.tasks.filter((task) => task.status === 'done').length
  const blocked = blueprint.tasks.filter((task) => task.status === 'blocked').length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return `${percent}% (${done}/${total} tasks done, ${blocked} blocked, updated ${todayIsoDate()})`
}

function deriveBlueprintStatus(currentStatus: LifecycleBlueprintStatus): LifecycleBlueprintStatus {
  if (currentStatus === 'completed' || currentStatus === 'archived') {
    return currentStatus
  }
  return 'in-progress'
}

function assertTaskExists(blueprint: Blueprint, taskId: string) {
  const task = blueprint.tasks.find((entry) => entry.id === taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found in blueprint ${blueprint.name}`)
  }
  return task
}

function assertTaskDoneRequirements(blueprint: Blueprint): void {
  for (const task of blueprint.tasks) {
    if (task.status !== 'done') {
      throw new Error(
        `Blueprint ${blueprint.name} cannot finalize: Task ${task.id} is ${task.status}`,
      )
    }

    const { checked, total } = task.acceptanceCriteria
    if (total > 0 && checked !== total) {
      throw new Error(
        `Blueprint ${blueprint.name} cannot finalize: Task ${task.id} has ${checked}/${total} acceptance criteria checked`,
      )
    }
  }
}

function applyTaskIntent(
  markdown: string,
  blueprint: Blueprint,
  intent: Exclude<BlueprintLifecycleIntent, { type: 'start' | 'park' | 'finalize' }>,
): string {
  const task = assertTaskExists(blueprint, intent.taskId)

  switch (intent.type) {
    case 'task_start': {
      if (task.status === 'done') {
        throw new Error(`Task ${task.id} is already done`)
      }
      return updateBlockedReason(updateTaskStatus(markdown, task.id, 'in_progress'), task.id, '')
    }
    case 'task_block': {
      if (task.status === 'done') {
        throw new Error(`Task ${task.id} is already done`)
      }
      const reason = intent.reason.trim()
      if (!reason) {
        throw new Error(`Task ${task.id} requires a non-empty block reason`)
      }
      return updateBlockedReason(updateTaskStatus(markdown, task.id, 'blocked'), task.id, reason)
    }
    case 'task_unblock': {
      if (task.status !== 'blocked' && !task.blockedReason) {
        throw new Error(`Task ${task.id} is not blocked`)
      }
      return updateBlockedReason(updateTaskStatus(markdown, task.id, 'todo'), task.id, '')
    }
    case 'task_complete': {
      return completeTask(markdown, task.id)
    }
  }
}

export function applyBlueprintLifecycle(
  markdown: string,
  slug: string,
  intent: BlueprintLifecycleIntent,
): BlueprintLifecycleResult {
  const blueprint = parseBlueprint(markdown, slug)
  const currentStatus = assertExecutableStatus(blueprint.status)

  if (
    (currentStatus === 'completed' || currentStatus === 'archived') &&
    intent.type !== 'finalize'
  ) {
    throw new Error(`Blueprint ${slug} is already ${currentStatus}`)
  }

  let nextMarkdown = markdown
  let targetStatus: LifecycleBlueprintStatus = currentStatus
  const auditEvents: string[] = []

  switch (intent.type) {
    case 'start':
      if (currentStatus === 'completed' || currentStatus === 'archived') {
        throw new Error(`Blueprint ${slug} cannot start from ${currentStatus}`)
      }
      targetStatus = 'in-progress'
      auditEvents.push(`blueprint.start:${slug}`)
      break
    case 'park':
      if (currentStatus === 'completed' || currentStatus === 'archived') {
        throw new Error(`Blueprint ${slug} cannot park from ${currentStatus}`)
      }
      targetStatus = 'parked'
      auditEvents.push(`blueprint.park:${slug}`)
      break
    case 'finalize': {
      assertTaskDoneRequirements(blueprint)
      targetStatus = 'completed'
      auditEvents.push(`blueprint.finalize:${slug}`)
      break
    }
    default: {
      nextMarkdown = applyTaskIntent(markdown, blueprint, intent)
      targetStatus = deriveBlueprintStatus(
        currentStatus === 'draft' || currentStatus === 'planned' || currentStatus === 'parked'
          ? 'in-progress'
          : currentStatus,
      )
      auditEvents.push(`blueprint.${intent.type}:${slug}:${intent.taskId}`)
      break
    }
  }

  nextMarkdown = setBlueprintFrontmatterFields(nextMarkdown, {
    status: targetStatus,
    last_updated: todayIsoDate(),
    completed_at: targetStatus === 'completed' ? todayIsoDate() : undefined,
  })

  const reparsed = parseBlueprint(nextMarkdown, slug)
  const progress = formatProgress(reparsed)
  const finalMarkdown = setBlueprintFrontmatterFields(nextMarkdown, {
    progress,
    last_updated: todayIsoDate(),
    completed_at: targetStatus === 'completed' ? todayIsoDate() : undefined,
  })

  return {
    auditEvents,
    blueprint: parseBlueprint(finalMarkdown, slug),
    markdown: finalMarkdown,
    progress,
    targetStatus,
  }
}
