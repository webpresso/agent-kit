import type { Task } from './types.js'

/**
 * Parsed task from an implementation plan
 */
export interface PlanTask {
  id: string
  title: string
  description: string
  type: 'lint-fix' | 'typecheck-fix' | 'test-fix' | 'implement' | 'research' | 'verify'
  package?: string
  file?: string
  dependsOn: string[]
  metadata?: Record<string, unknown>
}

/**
 * Plan parsing result
 */
export interface ParsedPlan {
  title: string
  tasks: PlanTask[]
  metadata: {
    totalTasks: number
    maxParallelism: number
    criticalPathLength: number
  }
}

/** Pattern for numbered list format: `1. [depends: 2,3] Task description` */
const TASK_PATTERN = /^(\d+)\.\s*(?:\[depends:\s*([^\]]+)\])?\s*(.+)$/
/** Pattern for checkbox format: `- [ ] [depends: 1] Task description` */
const CHECKBOX_PATTERN = /^-\s*\[[ x]\]\s*(?:\[depends:\s*([^\]]+)\])?\s*(.+)$/i

/**
 * Extract title from markdown heading
 */
function extractTitle(lines: string[]): string {
  for (const line of lines) {
    if (line.startsWith('# ')) {
      return line.slice(2).trim()
    }
  }
  return ''
}

/**
 * Parse dependencies string into array
 */
function parseDependencies(deps: string | undefined): string[] {
  return deps ? deps.split(',').map((d) => d.trim()) : []
}

/**
 * Try to parse a numbered task from a line
 */
function parseNumberedTask(line: string): PlanTask | null {
  const match = line.match(TASK_PATTERN)
  if (!match) return null

  const [, num, deps, desc] = match
  if (!num || !desc) return null

  return {
    id: num,
    title: desc,
    description: desc,
    type: inferTaskType(desc),
    dependsOn: parseDependencies(deps),
    ...extractTaskMetadata(desc),
  }
}

/**
 * Try to parse a checkbox task from a line
 */
function parseCheckboxTask(line: string, index: number): PlanTask | null {
  const match = line.match(CHECKBOX_PATTERN)
  if (!match) return null

  const [, deps, desc] = match
  if (!desc) return null

  return {
    id: String(index),
    title: desc,
    description: desc,
    type: inferTaskType(desc),
    dependsOn: parseDependencies(deps),
    ...extractTaskMetadata(desc),
  }
}

/**
 * Parse all tasks from markdown lines
 */
function parseAllTasks(lines: string[]): PlanTask[] {
  const tasks: PlanTask[] = []
  let checkboxIndex = 0

  for (const line of lines) {
    const trimmed = line.trim()

    const numberedTask = parseNumberedTask(trimmed)
    if (numberedTask) {
      tasks.push(numberedTask)
      continue
    }

    checkboxIndex++
    const checkboxTask = parseCheckboxTask(trimmed, checkboxIndex)
    if (checkboxTask) {
      tasks.push(checkboxTask)
    }
  }

  return tasks
}

/**
 * Parse implementation plan markdown into structured tasks.
 *
 * Supports formats:
 * - Numbered lists with dependencies: `1. [depends: 2,3] Task description`
 * - Task blocks with metadata
 * - Checkbox lists: `- [ ] Task description`
 *
 * @example
 * ```markdown
 * # Implementation Plan
 *
 * ## Tasks
 * 1. Fix lint errors in cli2
 * 2. [depends: 1] Fix typecheck errors in cli2
 * 3. [depends: 1] Fix typecheck errors in schema-engine
 * 4. [depends: 2,3] Run full test suite
 * ```
 */
export function parsePlan(markdown: string): ParsedPlan {
  const lines = markdown.split('\n')
  const title = extractTitle(lines)
  const tasks = parseAllTasks(lines)

  return {
    title,
    tasks,
    metadata: {
      totalTasks: tasks.length,
      maxParallelism: calculateMaxParallelism(tasks),
      criticalPathLength: calculateCriticalPath(tasks),
    },
  }
}

/**
 * Task type detection rules - keywords map to task types
 */
const TASK_TYPE_RULES: Array<{ keywords: string[]; type: PlanTask['type'] }> = [
  { keywords: ['lint', 'biome'], type: 'lint-fix' },
  { keywords: ['type', 'tsc', 'tsgo'], type: 'typecheck-fix' },
  { keywords: ['test', 'vitest'], type: 'test-fix' },
  { keywords: ['research', 'investigate'], type: 'research' },
  { keywords: ['verify', 'check'], type: 'verify' },
]

/**
 * Check if description contains any of the keywords
 */
function matchesKeywords(lower: string, keywords: string[]): boolean {
  return keywords.some((kw) => lower.includes(kw))
}

/**
 * Infer task type from description
 */
function inferTaskType(desc: string): PlanTask['type'] {
  const lower = desc.toLowerCase()

  for (const rule of TASK_TYPE_RULES) {
    if (matchesKeywords(lower, rule.keywords)) {
      return rule.type
    }
  }

  return 'implement'
}

/**
 * Extract package and file from task description
 */
function extractTaskMetadata(desc: string): Partial<PlanTask> {
  const result: Partial<PlanTask> = {}

  // Extract package name: "in cli2", "for schema-engine", "@myorg/cli2"
  const pkgPatterns = [
    /\bin\s+(?:@myorg\/)?(\w[\w-]*)/i,
    /\bfor\s+(?:@myorg\/)?(\w[\w-]*)/i,
    /@myorg\/([\w-]+)/,
  ]

  for (const pattern of pkgPatterns) {
    const match = desc.match(pattern)
    if (match) {
      result.package = match[1]
      break
    }
  }

  // Extract file path
  const filePattern = /\b([\w/.-]+\.(?:ts|tsx|js|jsx|json|md))\b/
  const fileMatch = desc.match(filePattern)
  if (fileMatch) {
    result.file = fileMatch[1]
  }

  return result
}

/**
 * Calculate maximum parallelism (tasks with no dependencies)
 */
function calculateMaxParallelism(tasks: PlanTask[]): number {
  // Group by dependency depth
  const depths = new Map<string, number>()

  function getDepth(taskId: string): number {
    const cached = depths.get(taskId)
    if (cached !== undefined) return cached

    const task = tasks.find((t) => t.id === taskId)
    if (!task || !task.dependsOn.length) {
      depths.set(taskId, 0)
      return 0
    }

    const maxDepDep = Math.max(...task.dependsOn.map(getDepth))
    const depth = maxDepDep + 1
    depths.set(taskId, depth)
    return depth
  }

  // Calculate depths for all tasks
  for (const task of tasks) {
    getDepth(task.id)
  }

  // Count tasks at each depth level
  const levelCounts = new Map<number, number>()
  for (const depth of depths.values()) {
    levelCounts.set(depth, (levelCounts.get(depth) ?? 0) + 1)
  }

  return Math.max(...levelCounts.values(), 0)
}

/**
 * Calculate critical path length (longest dependency chain)
 */
function calculateCriticalPath(tasks: PlanTask[]): number {
  const depths = new Map<string, number>()

  function getDepth(taskId: string): number {
    const cached = depths.get(taskId)
    if (cached !== undefined) return cached

    const task = tasks.find((t) => t.id === taskId)
    if (!task || !task.dependsOn.length) {
      depths.set(taskId, 1)
      return 1
    }

    const maxDepDep = Math.max(...task.dependsOn.map(getDepth))
    const depth = maxDepDep + 1
    depths.set(taskId, depth)
    return depth
  }

  for (const task of tasks) {
    getDepth(task.id)
  }

  return Math.max(...depths.values(), 0)
}

/**
 * Convert parsed plan tasks to Task format for executor
 */
export function planTasksToGraphTasks(planTasks: PlanTask[]): Array<{
  task: Task<PlanTask>
  dependsOn?: string[]
}> {
  return planTasks.map((pt) => ({
    task: {
      id: pt.id,
      data: pt,
      dependencies: pt.dependsOn,
    },
    dependsOn: pt.dependsOn.length > 0 ? pt.dependsOn : undefined,
  }))
}
