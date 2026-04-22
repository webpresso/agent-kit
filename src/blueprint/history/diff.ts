/**
 * Plan Diff Generator
 *
 * Pure function that generates human-readable diffs between two plan states.
 * Detects changes in task status, titles, blocked reasons, and acceptance criteria.
 */

import type { Blueprint, Task } from '#core/parser'

export interface DiffChange {
  type: string
  description: string
}

export interface DiffFieldChange {
  type: string
  taskId: string
  field: string
  before: unknown
  after: unknown
}

export interface BlueprintDiff {
  added: DiffChange[]
  removed: DiffChange[]
  changed: DiffFieldChange[]
}

/**
 * Generate a human-readable diff between two plan states
 *
 * @param before - Previous plan state
 * @param after - Current plan state
 * @returns Structured diff with added, removed, and changed items
 */
export function generateBlueprintDiff(before: Blueprint, after: Blueprint): BlueprintDiff {
  const added: DiffChange[] = []
  const removed: DiffChange[] = []
  const changed: DiffFieldChange[] = []

  const beforeTasks = createTaskMap(before.tasks)
  const afterTasks = createTaskMap(after.tasks)

  for (const [id, task] of beforeTasks) {
    if (!afterTasks.has(id)) {
      removed.push({
        type: 'task',
        description: formatTaskDescription(task),
      })
    }
  }

  for (const [id, afterTask] of afterTasks) {
    const beforeTask = beforeTasks.get(id)

    if (!beforeTask) {
      added.push({
        type: 'task',
        description: formatTaskDescription(afterTask),
      })
    } else {
      detectTaskChanges(beforeTask, afterTask, changed)
    }
  }

  return { added, removed, changed }
}

function createTaskMap(tasks: Task[]): Map<string, Task> {
  return new Map(tasks.map((task) => [task.id, task]))
}

function formatTaskDescription(task: Task): string {
  return `Task ${task.id}: ${task.title}`
}

function detectTaskChanges(before: Task, after: Task, changed: DiffFieldChange[]): void {
  const taskId = after.id

  if (before.status !== after.status) {
    changed.push({
      type: 'task',
      taskId,
      field: 'status',
      before: before.status,
      after: after.status,
    })
  }

  if (before.title !== after.title) {
    changed.push({
      type: 'task',
      taskId,
      field: 'title',
      before: before.title,
      after: after.title,
    })
  }

  if (before.blockedReason !== after.blockedReason) {
    changed.push({
      type: 'task',
      taskId,
      field: 'blocked',
      before: before.blockedReason,
      after: after.blockedReason,
    })
  }

  const beforeChecked = before.acceptanceCriteria.checked
  const afterChecked = after.acceptanceCriteria.checked
  const beforeTotal = before.acceptanceCriteria.total
  const afterTotal = after.acceptanceCriteria.total

  if (beforeChecked !== afterChecked || beforeTotal !== afterTotal) {
    changed.push({
      type: 'task',
      taskId,
      field: 'acceptanceCriteria',
      before: `${beforeChecked}/${beforeTotal}`,
      after: `${afterChecked}/${afterTotal}`,
    })
  }
}

/**
 * Format a diff for human display (CLI output)
 */
export function formatDiffForDisplay(diff: BlueprintDiff): string {
  const lines: string[] = []

  for (const item of diff.added) {
    lines.push(`+ ${item.description}`)
  }

  for (const item of diff.removed) {
    lines.push(`- ${item.description}`)
  }

  for (const change of diff.changed) {
    const displayValue = formatChangeValue(change)
    lines.push(`~ ${displayValue}`)
  }

  return lines.join('\n')
}

function formatChangeValue(change: DiffFieldChange): string {
  const beforeValue = formatValue(change.before)
  const afterValue = formatValue(change.after)
  return `Task ${change.taskId}: ${change.field} ${beforeValue} → ${afterValue}`
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return 'none'
  }
  if (typeof value === 'string') {
    return `"${value}"`
  }
  return String(value)
}
