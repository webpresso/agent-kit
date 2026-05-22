import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import matter from 'gray-matter'
import { z } from 'zod'

const SKILL_HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'SessionStart',
  'UserPromptSubmit',
] as const

const RESERVED_GLOBAL_BINS = [
  'wp-pretool-guard',
  'wp-post-tool',
  'wp-guard-switch',
  'wp-sessionstart-routing',
  'wp-stop-qa',
] as const

const TRACEABILITY_PREFIX = '# from-skill:'

export type SkillHookEvent = (typeof SKILL_HOOK_EVENTS)[number]

export interface SkillHook {
  skillName: string
  event: SkillHookEvent
  matcher?: string
  command: string
  timeout?: number
}

const SkillHookEntrySchema = z
  .object({
    matcher: z.string().trim().min(1).optional(),
    command: z.string().trim().min(1, 'command is required'),
    timeout: z.number().int().positive().optional(),
  })
  .strict()

const SkillHooksSchema = z
  .object({
    PreToolUse: z.array(SkillHookEntrySchema).optional(),
    PostToolUse: z.array(SkillHookEntrySchema).optional(),
    Stop: z.array(SkillHookEntrySchema).optional(),
    SessionStart: z.array(SkillHookEntrySchema).optional(),
    UserPromptSubmit: z.array(SkillHookEntrySchema).optional(),
  })
  .strict()
  .superRefine((hooks, ctx) => {
    for (const event of ['PreToolUse', 'PostToolUse'] as const) {
      const entries = hooks[event] ?? []
      entries.forEach((entry, index) => {
        if (!entry.matcher) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${event} hooks require a matcher`,
            path: [event, index, 'matcher'],
          })
        }
      })
    }

    for (const event of SKILL_HOOK_EVENTS) {
      const entries = hooks[event] ?? []
      entries.forEach((entry, index) => {
        const reserved = RESERVED_GLOBAL_BINS.find((bin) => entry.command.includes(bin))
        if (reserved) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `reserved global hook command ${reserved} is not allowed in skill hooks`,
            path: [event, index, 'command'],
          })
        }
      })
    }
  })

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'hooks'}: ${issue.message}`)
    .join('; ')
}

export function validateSkillHooks(
  skillName: string,
  hooks: unknown,
): Record<SkillHookEvent, Array<z.infer<typeof SkillHookEntrySchema>>> {
  const parsed = SkillHooksSchema.safeParse(hooks ?? {})
  if (!parsed.success) {
    throw new Error(
      `Invalid hooks frontmatter in skill ${skillName}: ${formatIssues(parsed.error)}`,
    )
  }
  return parsed.data as Record<SkillHookEvent, Array<z.infer<typeof SkillHookEntrySchema>>>
}

export function extractSkillHooks(skillsDir: string): SkillHook[] {
  if (!existsSync(skillsDir)) return []

  const hooks: SkillHook[] = []
  // Wave-3: `.agent/skills/<slug>` may be a symlink (catalog projection via
  // unified-sync) — `withFileTypes` reports isDirectory()=false for those, so
  // we stat-resolve through symlinks before filtering.
  const skillNames = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => {
      if (entry.isDirectory()) return true
      if (!entry.isSymbolicLink()) return false
      try {
        return statSync(join(skillsDir, entry.name)).isDirectory()
      } catch {
        return false
      }
    })
    .map((entry) => entry.name)
    .sort()

  for (const skillName of skillNames) {
    const skillPath = join(skillsDir, skillName, 'SKILL.md')
    if (!existsSync(skillPath)) continue

    const parsed = matter(readFileSync(skillPath, 'utf8'))
    const validated = validateSkillHooks(skillName, parsed.data.hooks)
    for (const event of SKILL_HOOK_EVENTS) {
      for (const entry of validated[event] ?? []) {
        hooks.push({
          skillName,
          event,
          matcher: entry.matcher,
          command: entry.command,
          timeout: entry.timeout,
        })
      }
    }
  }

  return hooks
}

export function buildSkillTag(skillName: string): string {
  return `${TRACEABILITY_PREFIX} ${skillName}`
}

export function isTaggedSkillHook(command: string | undefined): boolean {
  return typeof command === 'string' && command.includes(TRACEABILITY_PREFIX)
}
