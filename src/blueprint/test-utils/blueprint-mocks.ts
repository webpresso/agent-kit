/**
 * Shared test utilities for blueprint mocking
 */

import type { Blueprint, Task } from '#core/parser'

export interface MockBlueprintOptions {
  slug?: string
  name?: string
  status?: string
  complexity?: string
  lastUpdated?: string
  tasks?: Task[]
  phases?: Blueprint['phases']
  raw?: string
}

export interface MockTaskOptions {
  id?: string
  title?: string
  status?: Task['status']
  depends?: string[]
  acceptanceCriteria?: Task['acceptanceCriteria']
}

/**
 * Create a mock Plan with sensible defaults
 */
export function createMockBlueprint(options: MockBlueprintOptions = {}): Blueprint {
  const defaultTask = createMockTask()
  const tasks = options.tasks ?? [defaultTask]
  const blueprintName = options.name ?? options.slug ?? 'test-plan'

  return {
    name: blueprintName,
    title: options.name ?? options.slug ?? 'Test Plan',
    status: options.status ?? 'in-progress',
    complexity: options.complexity ?? 'S',
    lastUpdated: options.lastUpdated ?? '2026-01-01',
    tasks,
    phases: options.phases ?? [],
    raw: options.raw ?? createDefaultRawMarkdown(blueprintName, tasks),
  }
}

/**
 * Create a mock Task with sensible defaults
 */
export function createMockTask(options: MockTaskOptions = {}): Task {
  return {
    id: options.id ?? '1.1',
    title: options.title ?? 'Test Task',
    status: options.status ?? 'todo',
    depends: options.depends,
    stepType: 'implement',
    acceptanceCriteria: options.acceptanceCriteria ?? {
      total: 2,
      checked: 0,
    },
  }
}

/**
 * Helper: Generate default raw markdown for a plan
 */
function createDefaultRawMarkdown(name: string, tasks: Task[]): string {
  const taskSections = tasks
    .map(
      (task) =>
        `#### Task ${task.id}: ${task.title}\n\n` +
        `- [${task.acceptanceCriteria.checked > 0 ? 'x' : ' '}] First criterion\n` +
        `- [${task.acceptanceCriteria.checked > 1 ? 'x' : ' '}] Second criterion\n`,
    )
    .join('\n')

  return `---
 type: blueprint
 status: in-progress
 complexity: S
 last_updated: 2026-01-01
 created: 2026-01-01
 ---
 
 # ${name}
 
 ## Phase 1: Foundation [Complexity: S]
 
 ${taskSections}
 `
}
