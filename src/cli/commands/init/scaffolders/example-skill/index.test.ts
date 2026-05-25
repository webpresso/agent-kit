import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

import { scaffoldExampleSkill } from './index.js'

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'wp-example-skill-test-'))
}

describe('scaffoldExampleSkill', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
  })

  it('creates SKILL.md at .agent/skills/hello-webpresso/SKILL.md', async () => {
    const spawnMock = vi.fn().mockReturnValue({ status: 0 }) as unknown as typeof spawnSync

    await scaffoldExampleSkill(tmpDir, { spawn: spawnMock })

    const skillPath = join(tmpDir, '.agent', 'skills', 'hello-webpresso', 'SKILL.md')
    const content = readFileSync(skillPath, 'utf-8')
    expect(content).toContain('hello-webpresso')
    expect(content).toContain('webpresso is ready')
  })

  it('is idempotent — second call does not overwrite', async () => {
    const spawnMock = vi.fn().mockReturnValue({ status: 0 }) as unknown as typeof spawnSync

    await scaffoldExampleSkill(tmpDir, { spawn: spawnMock })

    const skillPath = join(tmpDir, '.agent', 'skills', 'hello-webpresso', 'SKILL.md')
    const original = readFileSync(skillPath, 'utf-8')

    // Mutate the file to confirm it won't be overwritten on second call
    const { writeFileSync } = await import('node:fs')
    writeFileSync(skillPath, original + '\n<!-- custom -->', 'utf-8')

    await scaffoldExampleSkill(tmpDir, { spawn: spawnMock })

    const after = readFileSync(skillPath, 'utf-8')
    expect(after).toContain('<!-- custom -->')
  })

  it('template contains valid SKILL.md frontmatter (name, description, user-invocable)', async () => {
    const spawnMock = vi.fn().mockReturnValue({ status: 0 }) as unknown as typeof spawnSync

    await scaffoldExampleSkill(tmpDir, { spawn: spawnMock })

    const skillPath = join(tmpDir, '.agent', 'skills', 'hello-webpresso', 'SKILL.md')
    const content = readFileSync(skillPath, 'utf-8')

    // Validate frontmatter fields exist (simple line-presence check — no gray-matter dep needed)
    expect(content).toMatch(/^---/m)
    expect(content).toMatch(/name:\s*hello-webpresso/)
    expect(content).toMatch(/description:/)
    expect(content).toMatch(/user-invocable:\s*true/)
  })

  it('does not throw when wp compile is not on PATH', async () => {
    const spawnMock = vi.fn().mockImplementation(() => {
      throw new Error('spawn ENOENT')
    }) as unknown as typeof spawnSync

    await expect(scaffoldExampleSkill(tmpDir, { spawn: spawnMock })).resolves.toBeUndefined()

    const skillPath = join(tmpDir, '.agent', 'skills', 'hello-webpresso', 'SKILL.md')
    const content = readFileSync(skillPath, 'utf-8')
    expect(content).toContain('hello-webpresso')
  })
})
