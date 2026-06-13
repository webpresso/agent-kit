import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildHarnessGateVerdict, detectTriggeredSurfaces, loadHarnessGatePlan } from './index.ts'

describe('harness gate runner', () => {
  let root: string
  let consumerRoot: string

  beforeEach(() => {
    root = join(tmpdir(), `wp-harness-gate-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    consumerRoot = join(
      tmpdir(),
      `wp-harness-consumer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(join(root, 'catalog', 'agent', 'harness-gate'), { recursive: true })
    mkdirSync(join(root, 'catalog', 'agent'), { recursive: true })
    mkdirSync(join(consumerRoot, 'harness-gate'), { recursive: true })
    writeFileSync(
      join(root, 'catalog', 'agent', 'harness-surfaces.yaml'),
      'version: 1\nsurfaces:\n  - id: codex-hooks\n    paths: [src/hooks]\n    evidence: [src/hooks/pretool-guard/index.ts]\n',
    )
    writeFileSync(
      join(root, 'catalog', 'agent', 'harness-gate', 'consumers.yaml'),
      `version: 1\nconsumers:\n  - id: sample\n    repo: sample\n    worktreeAlias: ignored\n    suiteManifest: harness-gate/suites.yaml\n    harnessSurfaces: [codex-hooks]\n    heldInSuites: [sample.smoke]\n    heldOutSuites: [sample.deep]\n`,
    )
    writeFileSync(
      join(consumerRoot, 'harness-gate', 'suites.yaml'),
      'version: 1\nconsumer: sample\nsuites:\n  - id: sample.smoke\n    tier: held-in\n    command: echo smoke\n    surfaces: [codex-hooks]\n    proof: smoke proof\n  - id: sample.deep\n    tier: held-out\n    command: echo deep\n    surfaces: [codex-hooks]\n    proof: deep proof\n',
    )
    process.env.HARNESS_GATE_SAMPLE_ROOT = consumerRoot
  })

  afterEach(async () => {
    delete process.env.HARNESS_GATE_SAMPLE_ROOT
    await import('node:fs/promises').then(async (fs) => {
      await fs.rm(root, { recursive: true, force: true })
      await fs.rm(consumerRoot, { recursive: true, force: true })
    })
  })

  it('loads consumer suite manifests and validates declared suite ids', () => {
    const plan = loadHarnessGatePlan(root)

    expect(plan.suites.map((suite) => suite.id)).toEqual(['sample.smoke', 'sample.deep'])
  })

  it('detects changed harness surfaces and creates planned verdicts', () => {
    const plan = loadHarnessGatePlan(root)
    const triggeredSurfaces = detectTriggeredSurfaces(['src/hooks/pretool-guard/index.ts'], root)
    const verdict = buildHarnessGateVerdict({ plan, triggeredSurfaces, rootDirectory: root })

    expect(triggeredSurfaces).toEqual(['codex-hooks'])
    expect(verdict.ok).toBe(true)
    expect(verdict.mode).toBe('planned-only')
    expect(verdict.plannedOnly).toBe(true)
    expect(verdict.suites.map((suite) => suite.status)).toEqual(['planned', 'planned'])
  })
})
