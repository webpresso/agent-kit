import { describe, expect, it } from 'vitest'

import { parseBlueprint } from './core/parser.js'
import { buildRoadmapModel } from './roadmap.js'

function parse(markdown: string, name: string) {
  return parseBlueprint(markdown, name)
}

describe('buildRoadmapModel', () => {
  it('builds roadmap rollups and orphan children', () => {
    const roadmap = parse(
      `---
type: parent-roadmap
status: in-progress
complexity: L
last_updated: 2026-05-06
created: 2026-05-06
---
# Roadmap
`,
      'roadmap-2026',
    )
    const done = parse(
      `---
type: blueprint
status: completed
complexity: S
last_updated: 2026-05-06
created: 2026-05-06
parent_roadmap: roadmap-2026
---
# Done
#### Task 1.1: Ship
**Status:** done
`,
      'done-child',
    )
    const inProgress = parse(
      `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-05-06
created: 2026-05-06
parent_roadmap: roadmap-2026
---
# In progress
#### Task 1.1: Work
**Status:** in_progress
`,
      'in-progress-child',
    )
    const planned = parse(
      `---
type: blueprint
status: planned
complexity: S
last_updated: 2026-05-06
created: 2026-05-06
parent_roadmap: roadmap-2026
---
# Planned
#### Task 1.1: Work
**Status:** todo
`,
      'planned-child',
    )
    const draft = parse(
      `---
type: blueprint
status: draft
complexity: S
last_updated: 2026-05-06
created: 2026-05-06
parent_roadmap: roadmap-2026
---
# Draft
#### Task 1.1: Work
**Status:** todo
`,
      'draft-child',
    )
    const orphan = parse(
      `---
type: blueprint
status: planned
complexity: S
last_updated: 2026-05-06
created: 2026-05-06
parent_roadmap: missing-roadmap
---
# Orphan
#### Task 1.1: Work
**Status:** todo
`,
      'orphan-child',
    )

    const model = buildRoadmapModel([roadmap, done, inProgress, planned, draft, orphan])

    expect(model.roadmaps).toHaveLength(1)
    expect(model.roadmaps[0]?.children.map((child) => child.name)).toEqual([
      'done-child',
      'draft-child',
      'in-progress-child',
      'planned-child',
    ])
    expect(model.roadmaps[0]?.rollup).toEqual({
      children: 4,
      done: 1,
      inProgress: 1,
      planned: 1,
      draft: 1,
    })
    expect(model.orphanChildren.map((child) => child.name)).toEqual(['orphan-child'])
  })

  it('preserves opaque cross-repo refs without crashing and treats them as orphans when unresolved', () => {
    const roadmap = parse(
      `---
type: parent-roadmap
status: in-progress
complexity: L
last_updated: 2026-05-06
created: 2026-05-06
---
# Roadmap
`,
      'roadmap-2026',
    )
    const child = parse(
      `---
type: blueprint
status: planned
complexity: S
last_updated: 2026-05-06
created: 2026-05-06
parent_roadmap: "cross-repo: webpresso/monorepo -> webpresso/blueprints/completed/webpresso-public-extraction-roadmap"
---
# Child
#### Task 1.1: Work
**Status:** todo
`,
      'cross-repo-child',
    )

    const model = buildRoadmapModel([roadmap, child])

    expect(model.roadmaps[0]?.children).toEqual([])
    expect(model.orphanChildren.map((orphan) => orphan.name)).toEqual(['cross-repo-child'])
    expect(child.parentRoadmap).toContain('cross-repo:')
  })

  it('matches parent roadmap by basename when given a path-like parent_roadmap', () => {
    const roadmap = parse(
      `---
type: parent-roadmap
status: in-progress
complexity: L
last_updated: 2026-05-06
created: 2026-05-06
---
# Roadmap
`,
      'planned/roadmap-2026',
    )
    const child = parse(
      `---
type: blueprint
status: planned
complexity: S
last_updated: 2026-05-06
created: 2026-05-06
parent_roadmap: roadmap-2026
---
# Child
#### Task 1.1: Work
**Status:** todo
`,
      'child',
    )

    const model = buildRoadmapModel([roadmap, child])

    expect(model.roadmaps[0]?.children.map((entry) => entry.name)).toEqual(['child'])
  })
})
