import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BlueprintService } from './BlueprintService'

describe('BlueprintService (integration)', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'bp-service-'))
    const bpDir = join(tempDir, 'webpresso', 'blueprints')

    mkdirSync(join(bpDir, 'in-progress', 'test-plan'), { recursive: true })
    writeFileSync(
      join(bpDir, 'in-progress', 'test-plan', '_overview.md'),
      `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2025-01-01
---
# Test Plan

## Phase 1: Implementation

#### Task 1.1: First task
**Status:** todo

- [ ] Acceptance criterion A
- [ ] Acceptance criterion B

#### Task 1.2: Second task
**Status:** done

- [x] Done criterion
`,
    )

    mkdirSync(join(bpDir, 'completed', 'old-plan'), { recursive: true })
    writeFileSync(
      join(bpDir, 'completed', 'old-plan', '_overview.md'),
      `---
type: blueprint
status: completed
complexity: S
last_updated: 2025-01-01
---
# Old Plan

## Tasks
- [x] [T1] Only task
`,
    )
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('lists blueprints from real filesystem', async () => {
    const service = new BlueprintService(tempDir)
    const plans = await service.list()

    expect(plans.length).toBeGreaterThanOrEqual(2)
    const testPlan = plans.find((p) => p.name.includes('test-plan'))
    expect(testPlan).toMatchObject({ status: 'in-progress', complexity: 'M' })
    expect(testPlan?.status).toBe('in-progress')
    expect(testPlan?.complexity).toBe('M')
  })

  it('reads a specific blueprint by slug', async () => {
    const service = new BlueprintService(tempDir)
    const plan = await service.get('in-progress/test-plan')

    expect(plan.name).toBe('in-progress/test-plan')
    expect(plan.tasks.length).toBeGreaterThanOrEqual(1)
  })

  it('throws for nonexistent blueprint', async () => {
    const service = new BlueprintService(tempDir)
    await expect(service.get('nonexistent')).rejects.toThrow()
  })
})
