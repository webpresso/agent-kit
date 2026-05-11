import type { ParsedBlueprintForDb, ParsedTask } from '#db/parser/blueprint-db-parser'

import { taskIdLabel, titleLine } from './_field-map.js'

/**
 * Emit tasks.md — TDD-ordered checklist with [P] parallel markers.
 * [P] appears when a wave contains more than one task.
 * Pure function, <40 LOC.
 */
export function emitTasks(parsed: ParsedBlueprintForDb): string {
  const sections: string[] = [titleLine(parsed, 'Tasks'), '']

  if (parsed.tasks.length === 0) {
    sections.push('_No tasks defined._')
    return sections.join('\n')
  }

  const byWave = groupByWave(parsed.tasks)
  let globalIndex = 0

  for (const [wave, tasks] of byWave) {
    const isParallel = tasks.length > 1
    sections.push(`### ${wave}`, '')

    for (const task of tasks) {
      const label = taskIdLabel(globalIndex)
      const parallel = isParallel ? ' [P]' : ''
      const criterion = task.acceptanceCriteria[0] ?? ''
      const files = task.files.map((f) => f.filePath).join(', ')

      sections.push(`- [ ] ${label}: ${task.title}${parallel}`)
      if (criterion) {
        sections.push(`  - Acceptance: ${criterion.replace(/^[-*]\s*/, '')}`)
      }
      if (files) {
        sections.push(`  - Files: ${files}`)
      }
      globalIndex++
    }
    sections.push('')
  }

  return sections.join('\n').trimEnd() + '\n'
}

function groupByWave(tasks: readonly ParsedTask[]): Map<string, ParsedTask[]> {
  const map = new Map<string, ParsedTask[]>()
  for (const task of tasks) {
    const wave = task.wave ?? 'Wave 1'
    const bucket = map.get(wave) ?? []
    bucket.push(task)
    map.set(wave, bucket)
  }
  return map
}
