import { createOptimisticMutation } from '@myorg/ui'
import { useMutation, useMutationState } from '@tanstack/react-query'

import { sdk } from '#lib/graphql-client'

type Task = {
  id: string
  title: string
  completed: boolean
}

type TasksListResult = {
  tasksList: Task[]
}

type ToggleTaskInput = {
  projectId: string
  taskId: string
  completed: boolean
}

const tasksListKey = (projectId: string) => ['projects', projectId, 'tasks'] as const

export const toggleTaskCompletedOptions = (projectId: string) =>
  createOptimisticMutation<TasksListResult, ToggleTaskInput>({
    queryKey: tasksListKey(projectId),
    mutationFn: ({ taskId, completed }) => sdk.ToggleTaskCompleted({ taskId, completed }),
    applyOptimistic: (current, variables) => ({
      tasksList:
        current?.tasksList.map((task) =>
          task.id === variables.taskId ? { ...task, completed: variables.completed } : task,
        ) ?? [],
    }),
  })

export function useToggleTaskCompleted(projectId: string) {
  return useMutation(toggleTaskCompletedOptions(projectId))
}

export function PendingTaskToggles({ projectId }: { projectId: string }) {
  const mutationKey = toggleTaskCompletedOptions(projectId).mutationKey
  const pendingTaskIds = useMutationState<string>({
    filters: { mutationKey, status: 'pending' },
    select: (mutation) => mutation.state.variables?.taskId ?? '',
  }).filter(Boolean)

  return pendingTaskIds.length > 0 ? <div>Updating: {pendingTaskIds.join(', ')}</div> : null
}
