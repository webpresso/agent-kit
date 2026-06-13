import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadAgentOverlays, validateAgentOverlays } from './overlay-loader.js'

describe('agent overlay loader', () => {
  let root: string

  beforeEach(() => {
    root = join(tmpdir(), `wp-overlays-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(root, 'agent-overlays', 'codex'), { recursive: true })
    writeFileSync(join(root, 'agent-overlays', 'codex', 'evidence.md'), '# evidence\n')
    writeFileSync(join(root, 'agent-overlays', 'codex', 'prompt.md'), '# prompt\n')
    writeFileSync(
      join(root, 'agent-overlays', 'codex', 'manifest.yaml'),
      'version: 1\ncli: codex\nsurfaces: [generated-agent-surfaces]\nevidence: [evidence.md]\nfiles:\n  - source: prompt.md\n    target: overlays/codex/prompt.md\n',
    )
  })

  afterEach(async () => {
    await import('node:fs/promises').then((fs) => fs.rm(root, { recursive: true, force: true }))
  })

  it('loads overlay manifests as a third sync input layer', () => {
    const overlays = loadAgentOverlays(root)

    expect(overlays).toHaveLength(1)
    expect(overlays[0]).toMatchObject({ cli: 'codex', rootPath: 'agent-overlays/codex' })
  })

  it('passes evidence and collision validation for a supported overlay', () => {
    const result = validateAgentOverlays(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('detects missing evidence', () => {
    writeFileSync(
      join(root, 'agent-overlays', 'codex', 'manifest.yaml'),
      'version: 1\ncli: codex\nsurfaces: [generated-agent-surfaces]\nevidence: [missing.md]\nfiles: []\n',
    )

    const result = validateAgentOverlays(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      {
        file: 'agent-overlays/codex/manifest.yaml',
        message: 'codex evidence is missing or outside repo: missing.md',
      },
    ])
  })
})
