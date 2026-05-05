import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildSkillTag, extractSkillHooks, isTaggedSkillHook, validateSkillHooks } from './skill-hooks.js'

describe('skill-hooks', () => {
  let root: string
  let skillsDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ak-skill-hooks-'))
    skillsDir = join(root, '.agent', 'skills')
    mkdirSync(skillsDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('extracts hooks from SKILL.md frontmatter', () => {
    mkdirSync(join(skillsDir, 'verify'), { recursive: true })
    writeFileSync(
      join(skillsDir, 'verify', 'SKILL.md'),
      `---
name: verify
hooks:
  Stop:
    - command: ak audit agents
      timeout: 20
  PreToolUse:
    - matcher: Bash
      command: echo verify
---

# Verify
`,
    )

    expect(extractSkillHooks(skillsDir)).toEqual([
      {
        skillName: 'verify',
        event: 'PreToolUse',
        matcher: 'Bash',
        command: 'echo verify',
        timeout: undefined,
      },
      {
        skillName: 'verify',
        event: 'Stop',
        matcher: undefined,
        command: 'ak audit agents',
        timeout: 20,
      },
    ])
  })

  it('returns no entries for skills without hooks frontmatter', () => {
    mkdirSync(join(skillsDir, 'verify'), { recursive: true })
    writeFileSync(
      join(skillsDir, 'verify', 'SKILL.md'),
      `---
name: verify
description: plain skill
---

# Verify
`,
    )

    expect(extractSkillHooks(skillsDir)).toEqual([])
  })

  it('rejects malformed hooks frontmatter with a clear error', () => {
    mkdirSync(join(skillsDir, 'verify'), { recursive: true })
    writeFileSync(
      join(skillsDir, 'verify', 'SKILL.md'),
      `---
name: verify
hooks:
  PreToolUse:
    - command: echo nope
---

# Verify
`,
    )

    expect(() => extractSkillHooks(skillsDir)).toThrow(
      'Invalid hooks frontmatter in skill verify: PreToolUse.0.matcher: PreToolUse hooks require a matcher',
    )
  })

  it('rejects reserved global hook commands', () => {
    expect(() =>
      validateSkillHooks('verify', {
        Stop: [{ command: 'ak-stop-qa' }],
      }),
    ).toThrow('reserved global hook command ak-stop-qa is not allowed in skill hooks')
  })

  it('tags skill-managed commands for clean removal', () => {
    const tag = buildSkillTag('verify')
    expect(tag).toBe('# from-skill: verify')
    expect(isTaggedSkillHook(`[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/ak" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/ak" audit agents || true # from-skill: verify`)).toBe(true)
    expect(isTaggedSkillHook('./node_modules/.bin/ak-stop-qa')).toBe(false)
  })
})
