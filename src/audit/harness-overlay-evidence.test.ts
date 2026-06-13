import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { auditHarnessOverlayEvidence } from './harness-overlay-evidence.js'

describe('harness overlay evidence audit', () => {
  let root: string

  beforeEach(() => {
    root = join(tmpdir(), `wp-overlay-audit-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(root, 'agent-overlays', 'codex'), { recursive: true })
  })

  afterEach(async () => {
    await import('node:fs/promises').then((fs) => fs.rm(root, { recursive: true, force: true }))
  })

  it('passes when no overlays have been earned yet', () => {
    const result = auditHarnessOverlayEvidence(root)

    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
  })

  it('fails when an overlay lacks evidence', () => {
    writeFileSync(
      join(root, 'agent-overlays', 'codex', 'manifest.yaml'),
      'version: 1\ncli: codex\nsurfaces: [generated-agent-surfaces]\nevidence: [missing.md]\nfiles: []\n',
    )

    const result = auditHarnessOverlayEvidence(root)

    expect(result.ok).toBe(false)
    expect(result.violations[0]?.message).toContain('evidence is missing')
  })
})
