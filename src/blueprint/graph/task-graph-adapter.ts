import type { TaskGraph } from '#dag/task-graph'
import type { Task } from '#dag/types'

import { normalizedGraphSchema, type NormalizedGraph } from '#graph/schema'

export function taskGraphToNormalizedGraph(
  taskGraph: TaskGraph<{ title: string }>,
): NormalizedGraph {
  const tasks = taskGraph.getTopologicalOrder()
  const waves = taskGraph.getWaves()

  const waveByTaskId = new Map<string, number>()
  for (const [waveIndex, wave] of waves.entries()) {
    for (const task of wave) {
      waveByTaskId.set(task.id, waveIndex)
    }
  }

  const nodes = tasks.map((task: Task<{ title: string }>) => ({
    id: task.id,
    type: 'task' as const,
    label: task.data?.title ?? task.id,
    metadata: {
      wave_number: waveByTaskId.get(task.id) ?? 0,
    },
  }))

  const edges = tasks.flatMap((task: Task<{ title: string }>) =>
    task.dependencies.map((dependencyId) => ({
      source: dependencyId,
      target: task.id,
      type: 'depends_on' as const,
    })),
  )

  return normalizedGraphSchema.parse({
    nodes,
    edges,
    layout: { direction: 'TD' },
  })
}
