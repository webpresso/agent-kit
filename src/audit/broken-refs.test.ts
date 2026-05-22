import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { auditBrokenRefs, auditBrokenRefsAsRepoResult } from './broken-refs.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = path.join(
    os.tmpdir(),
    `wp-broken-refs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tmpDir, { recursive: true })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

async function writeAgentMd(relPath: string, content: string): Promise<void> {
  const fullPath = path.join(tmpDir, relPath)
  await mkdir(path.dirname(fullPath), { recursive: true })
  await writeFile(fullPath, content, 'utf8')
}

describe('auditBrokenRefs', () => {
  it('returns pass=true when no markdown files exist', () => {
    const result = auditBrokenRefs(tmpDir)
    expect(result.pass).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(result.checked).toBe(0)
  })

  it('passes when all relative links are valid', async () => {
    await writeAgentMd('AGENTS.md', '# Agents\n\nSee [guide](CLAUDE.md).\n')
    await writeAgentMd('CLAUDE.md', '# Claude\n\nHello.\n')
    const result = auditBrokenRefs(tmpDir)
    expect(result.pass).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('flags a missing relative link target', async () => {
    await writeAgentMd('AGENTS.md', '# Agents\n\nSee [missing](./does-not-exist.md).\n')
    const result = auditBrokenRefs(tmpDir)
    const violation = result.violations.find((v) => v.link === './does-not-exist.md')
    expect(violation).toBeDefined()
    expect(violation?.file).toBe('AGENTS.md')
  })

  it('skips absolute URLs', async () => {
    await writeAgentMd('AGENTS.md', '# A\n\nSee [link](https://example.com/foo).\n')
    const result = auditBrokenRefs(tmpDir)
    expect(result.pass).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('skips anchor-only links', async () => {
    await writeAgentMd('AGENTS.md', '# A\n\nSee [section](#section-name).\n')
    const result = auditBrokenRefs(tmpDir)
    expect(result.pass).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('skips generated path refs (.claude/skills/)', async () => {
    await writeAgentMd('AGENTS.md', '# A\n\nSee [generated](.claude/skills/foo.md).\n')
    const result = auditBrokenRefs(tmpDir)
    expect(result.pass).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('skips generated path refs (.claude/rules/)', async () => {
    await writeAgentMd('AGENTS.md', '# A\n\nSee [generated](.claude/rules/foo.md).\n')
    const result = auditBrokenRefs(tmpDir)
    expect(result.pass).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('skips generated path refs (.agents/skills/)', async () => {
    await writeAgentMd('AGENTS.md', '# A\n\nSee [generated](.agents/skills/foo/SKILL.md).\n')
    const result = auditBrokenRefs(tmpDir)
    expect(result.pass).toBe(true)
  })

  it('walks .agent/ subdirs and checks those md files', async () => {
    await writeAgentMd('.agent/rules/my-rule.md', '# Rule\n\nSee [missing](./nope.md).\n')
    const result = auditBrokenRefs(tmpDir)
    const violation = result.violations.find((v) => v.link === './nope.md')
    expect(violation).toBeDefined()
    expect(violation?.file).toContain('.agent/rules/my-rule.md')
  })

  it('does not flag links between valid .agent files', async () => {
    await writeAgentMd('.agent/rules/rule-a.md', '# A\n\nSee [rule-b](./rule-b.md).\n')
    await writeAgentMd('.agent/rules/rule-b.md', '# B\n\nContent.\n')
    const result = auditBrokenRefs(tmpDir)
    expect(result.pass).toBe(true)
  })

  it('handles files without any links', async () => {
    await writeAgentMd('AGENTS.md', '# Agents\n\nJust text, no links.\n')
    const result = auditBrokenRefs(tmpDir)
    expect(result.pass).toBe(true)
    expect(result.checked).toBe(1)
  })

  it('reports multiple violations', async () => {
    await writeAgentMd('AGENTS.md', '# A\n\nSee [one](./nope-one.md) and [two](./nope-two.md).\n')
    const result = auditBrokenRefs(tmpDir)
    expect(result.violations.length).toBeGreaterThanOrEqual(2)
  })
})

describe('auditBrokenRefsAsRepoResult', () => {
  it('wraps result in RepoAuditResult shape', async () => {
    await writeAgentMd('AGENTS.md', '# Agents\n\nHello.\n')
    const result = auditBrokenRefsAsRepoResult(tmpDir)
    expect(result.ok).toBe(true)
    expect(result.title).toBe('Broken refs audit')
    expect(Array.isArray(result.violations)).toBe(true)
  })
})
