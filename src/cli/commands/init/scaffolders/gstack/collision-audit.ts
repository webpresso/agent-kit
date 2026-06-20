import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type GstackSkillHost = 'claude' | 'codex'

export type GstackSkillCollision = {
  host: GstackSkillHost
  name: string
  path: string
}

export const WEBPRESSO_GSTACK_SKILLS = [
  'claude',
  'plan-eng-review',
  'plan-ceo-review',
  'plan-design-review',
  'review',
] as const

export function auditGstackSkillCollisions(input: {
  claudeSkillsRoot: string
  codexSkillsRoot: string
  exists?: typeof existsSync
  readFile?: typeof readFileSync
}): GstackSkillCollision[] {
  const exists = input.exists ?? existsSync
  const readFile = input.readFile ?? readFileSync
  const collisions: GstackSkillCollision[] = []

  for (const host of ['claude', 'codex'] as const) {
    const root = host === 'claude' ? input.claudeSkillsRoot : input.codexSkillsRoot
    for (const name of WEBPRESSO_GSTACK_SKILLS) {
      const skillPath = path.join(root, name, 'SKILL.md')
      if (!exists(skillPath)) continue
      let content = ''
      try {
        content = readFile(skillPath, 'utf8')
      } catch {
        content = ''
      }
      if (!content.includes('Derived from MIT-licensed gstack workflow ideas')) {
        collisions.push({ host, name, path: skillPath })
      }
    }
  }

  return collisions
}
