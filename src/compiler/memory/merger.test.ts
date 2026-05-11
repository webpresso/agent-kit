import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { mergeAgentsMd } from './merger.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'merger-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function write(name: string, content: string): string {
  const p = join(tmpDir, name)
  writeFileSync(p, content, 'utf8')
  return p
}

const BASE_AGENTS = `## Build\nbuild steps here\n\n## Test\ntest steps here\n`
const LAYER2_AGENTS = `## Build\noverridden build steps\n\n## Deploy\ndeploy steps here\n`

describe('mergeAgentsMd', () => {
  it('base layer sections appear in output', async () => {
    const base = write('base-AGENTS.md', BASE_AGENTS)
    const result = await mergeAgentsMd({
      layers: [base],
      outPath: join(tmpDir, 'AGENTS.md'),
    })
    expect(result.content).toContain('## Build')
    expect(result.content).toContain('build steps here')
    expect(result.content).toContain('## Test')
  })

  it('layer2 Build section overrides layer1 Build section', async () => {
    const base = write('base-AGENTS.md', BASE_AGENTS)
    const layer2 = write('layer2-AGENTS.md', LAYER2_AGENTS)
    const result = await mergeAgentsMd({
      layers: [base, layer2],
      outPath: join(tmpDir, 'AGENTS.md'),
    })
    expect(result.content).toContain('overridden build steps')
    expect(result.content).not.toContain('build steps here\n')
  })

  it('missing sections inherit from parent layer', async () => {
    const base = write('base-AGENTS.md', BASE_AGENTS)
    const layer2 = write('layer2-AGENTS.md', LAYER2_AGENTS)
    const result = await mergeAgentsMd({
      layers: [base, layer2],
      outPath: join(tmpDir, 'AGENTS.md'),
    })
    // Test section only in base — should still appear
    expect(result.content).toContain('## Test')
    expect(result.content).toContain('test steps here')
  })

  it('new sections from layer2 are appended', async () => {
    const base = write('base-AGENTS.md', BASE_AGENTS)
    const layer2 = write('layer2-AGENTS.md', LAYER2_AGENTS)
    const result = await mergeAgentsMd({
      layers: [base, layer2],
      outPath: join(tmpDir, 'AGENTS.md'),
    })
    expect(result.content).toContain('## Deploy')
    expect(result.content).toContain('deploy steps here')
  })

  it('skips missing layer files with warning', async () => {
    const base = write('base-AGENTS.md', BASE_AGENTS)
    const result = await mergeAgentsMd({
      layers: [base, join(tmpDir, 'nonexistent.md')],
      outPath: join(tmpDir, 'AGENTS.md'),
    })
    expect(result.warnings.some((w) => w.includes('nonexistent'))).toBe(true)
    expect(result.content).toContain('## Build')
  })

  it('applies op: append directive', async () => {
    const base = write('base-AGENTS.md', BASE_AGENTS)
    const directives = write(
      'memory.merge.yaml',
      'sections:\n  - heading: Build\n    op: append\n    content: "extra step"\n',
    )
    const result = await mergeAgentsMd({
      layers: [base],
      directivesPath: directives,
      outPath: join(tmpDir, 'AGENTS.md'),
    })
    const buildContent = result.content
    expect(buildContent).toContain('build steps here')
    expect(buildContent).toContain('extra step')
  })

  it('applies op: delete directive', async () => {
    const base = write('base-AGENTS.md', BASE_AGENTS)
    const directives = write(
      'memory.merge.yaml',
      'sections:\n  - heading: Build\n    op: delete\n',
    )
    const result = await mergeAgentsMd({
      layers: [base],
      directivesPath: directives,
      outPath: join(tmpDir, 'AGENTS.md'),
    })
    expect(result.content).not.toContain('## Build')
    expect(result.content).toContain('## Test')
  })

  it('applies frontmatter RFC 7396 patch from directives', async () => {
    const base = write('base-AGENTS.md', '---\ntitle: old\n---\n## Build\ncontent\n')
    const directives = write(
      'memory.merge.yaml',
      'frontmatter_patch:\n  title: new\n  owner: team\n',
    )
    const result = await mergeAgentsMd({
      layers: [base],
      directivesPath: directives,
      outPath: join(tmpDir, 'AGENTS.md'),
    })
    expect(result.content).toContain('title: new')
    expect(result.content).toContain('owner: team')
  })

  it('returns empty result when all layers missing', async () => {
    const result = await mergeAgentsMd({
      layers: [join(tmpDir, 'missing1.md'), join(tmpDir, 'missing2.md')],
      outPath: join(tmpDir, 'AGENTS.md'),
    })
    expect(result.content).toBe('')
    expect(result.warnings).toHaveLength(2)
  })

  it('emits provenance entries for each section', async () => {
    const base = write('base-AGENTS.md', BASE_AGENTS)
    const result = await mergeAgentsMd({
      layers: [base],
      outPath: join(tmpDir, 'AGENTS.md'),
    })
    expect(result.provenance.sections.length).toBeGreaterThanOrEqual(2)
    expect(result.provenance.sections[0]?.sectionSlug).toBeDefined()
  })
})
