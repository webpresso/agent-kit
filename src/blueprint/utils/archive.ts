/**
 * Archive Operations
 *
 * Validates that all tasks in a plan are complete and updates status in place.
 */

import type { Blueprint, Task } from '#core/parser'

import { access, readFile, writeFile } from 'node:fs/promises'

import { parseBlueprint } from '#core/parser'

export interface IncompleteTask {
  id: string
  title: string
  status: string
}

export interface ValidationResult {
  valid: boolean
  incompleteTasks?: IncompleteTask[]
  message?: string
}
/**
 * Validates that all tasks in a plan are complete.
 *
 * A task is considered complete when:
 * - status === 'done'
 * - All acceptance criteria checkboxes are checked
 *
 * @param plan - The plan to validate
 * @returns Validation result with details of incomplete tasks
 *
 * @example
 * ```typescript
 * const result = validateAllTasksDone(plan)
 * if (!result.valid) {
 *   console.error(result.message)
 *   console.log('Incomplete tasks:', result.incompleteTasks)
 * }
 * ```
 */
export function validateAllTasksDone(plan: Blueprint): ValidationResult {
  const incompleteTasks = findIncompleteTasks(plan.tasks)

  if (!incompleteTasks.length) {
    return { valid: true }
  }

  return {
    valid: false,
    incompleteTasks,
    message: formatErrorMessage(incompleteTasks),
  }
}

/**
 * Finds all incomplete tasks in a plan.
 *
 * @param tasks - Array of tasks to check
 * @returns Array of incomplete tasks
 */
function findIncompleteTasks(tasks: Task[]): IncompleteTask[] {
  return tasks
    .filter((task) => !isTaskComplete(task))
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
    }))
}

/**
 * Checks if a task is complete.
 *
 * @param task - Task to check
 * @returns True if task is complete
 */
function isTaskComplete(task: Task): boolean {
  // Task must have status 'done'
  if (task.status !== 'done') {
    return false
  }

  // All acceptance criteria checkboxes must be checked
  const { total, checked } = task.acceptanceCriteria
  if (total > 0 && checked !== total) {
    return false
  }

  return true
}

/**
 * Formats error message for incomplete tasks.
 *
 * @param incompleteTasks - Array of incomplete tasks
 * @returns Formatted error message
 */
function formatErrorMessage(incompleteTasks: IncompleteTask[]): string {
  const count = incompleteTasks.length
  const taskList = incompleteTasks.map((task) => `Task ${task.id} (${task.status})`).join(', ')

  return `${count} task${count === 1 ? '' : 's'} incomplete: ${taskList}`
}

/**
 * Result of an archive operation.
 */
export interface ArchiveResult {
  success: boolean
  newPath?: string
  error?: string
}

/**
 * Archives a plan by updating its status to completed in-place.
 *
 * This function:
 * 1. Validates all tasks are done (unless force = true)
 * 2. Updates frontmatter status to 'completed'
 * 3. Returns new path on success
 *
 * @param slug - Plan slug (e.g., 'my-plan')
 * @param projectPath - Root path of the project
 * @param force - Skip validation and force archive
 * @returns Archive result with success status and new path or error
 *
 * @example
 * ```typescript
 * const result = await archiveBlueprint('my-plan', '/path/to/project')
 * if (result.success) {
 *   console.log('Archived to:', result.newPath)
 * } else {
 *   console.error('Error:', result.error)
 * }
 * ```
 */
export async function archiveBlueprint(
  slug: string,
  projectPath: string,
  force = false,
): Promise<ArchiveResult> {
  // Check if already completed (before checking existence)
  if (isAlreadyCompleted(slug)) {
    return { success: false, error: 'Plan is already completed' }
  }

  const paths = buildPlanPaths(projectPath, slug)

  // Check if plan exists
  const planExists = await checkPlanExists(paths.sourcePath)
  if (!planExists) {
    return { success: false, error: `Plan not found: ${slug}` }
  }

  // Read plan and validate tasks (unless force)
  if (!force) {
    const validationError = await validatePlanTasks(paths.sourcePath, slug)
    if (validationError) {
      return { success: false, error: validationError }
    }
  }

  // Update frontmatter status
  const updateError = await updateBlueprintStatus(paths.sourcePath)
  if (updateError) {
    return { success: false, error: updateError }
  }

  return { success: true, newPath: paths.targetDir }
}

/**
 * Path information for archival operations.
 */
interface PlanPaths {
  sourcePath: string
  sourceDir: string
  targetDir: string
  planName: string
}

/**
 * Builds source and target paths for archival.
 *
 * @param projectPath - Root path of the project
 * @param slug - Plan slug
 * @returns Path information
 */
function buildPlanPaths(projectPath: string, slug: string): PlanPaths {
  const plansDir = `${projectPath}/webpresso/blueprints`

  const sourcePath = `${plansDir}/${slug}/_overview.md`
  const sourceDir = sourcePath.substring(0, sourcePath.lastIndexOf('/'))
  const targetDir = sourceDir

  return { sourcePath, sourceDir, targetDir, planName: slug }
}

/**
 * Extracts plan name from slug (removes status prefix).
 *
 * @param slug - Plan slug
 * @returns Plan name
 */
/**
 * Checks if plan is already in completed/ folder.
 *
 * @param slug - Plan slug
 * @returns True if already completed
 */
function isAlreadyCompleted(slug: string): boolean {
  return slug.startsWith('completed/')
}

/**
 * Checks if plan file exists.
 *
 * @param sourcePath - Path to plan file
 * @returns True if exists
 */
async function checkPlanExists(sourcePath: string): Promise<boolean> {
  try {
    await access(sourcePath)
    return true
  } catch {
    return false
  }
}

/**
 * Validates plan tasks are complete.
 *
 * @param sourcePath - Path to plan file
 * @param slug - Plan slug
 * @returns Error message if validation fails, undefined otherwise
 */
async function validatePlanTasks(sourcePath: string, slug: string): Promise<string | undefined> {
  const content = await readFile(sourcePath, 'utf-8')
  const plan = parseBlueprint(content, slug)

  const result = validateAllTasksDone(plan)
  if (!result.valid) {
    return result.message
  }

  return undefined
}

/**
 * Updates plan status to completed in frontmatter.
 *
 * @param sourcePath - Path to plan file
 * @returns Error message if update fails, undefined otherwise
 */
async function updateBlueprintStatus(sourcePath: string): Promise<string | undefined> {
  try {
    const content = await readFile(sourcePath, 'utf-8')
    const updated = content.replace(/^status:\s*\S+/m, 'status: completed')
    await writeFile(sourcePath, updated, 'utf-8')
    return undefined
  } catch (error) {
    return `Failed to update status: ${error instanceof Error ? error.message : String(error)}`
  }
}
