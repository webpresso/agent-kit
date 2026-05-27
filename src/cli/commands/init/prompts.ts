/**
 * Tier-3 skill selection — `--with`, `--all`, and an optional TTY prompt.
 *
 * Kept deliberately minimal: we don't pull in an interactive prompt library.
 * If the user runs `wp init` in a TTY without flags, we use `node:readline/promises`
 * to ask a single yes/no per Tier-3 skill. If stdin isn't a TTY and no flags
 * are provided, we default to installing the `base-kit` Tier-3 bootstrap.
 */
import { createInterface } from 'node:readline/promises'

export const TIER3_SKILLS = [
  'base-kit',
  'tanstack-query',
  'better-auth-best-practices',
  'react-doctor',
  'frontend-design',
  'web-design-guidelines',
  'vercel-react-best-practices',
] as const

export type Tier3Skill = (typeof TIER3_SKILLS)[number]
const DEFAULT_TIER3_SKILLS: readonly Tier3Skill[] = ['base-kit']

export interface ResolveSkillsInput {
  withFlag?: string
  allFlag?: boolean
  yesFlag?: boolean
  existing?: readonly string[]
  isTTY?: boolean
  inputStream?: NodeJS.ReadableStream
  outputStream?: NodeJS.WritableStream
}

export interface ResolveSkillsResult {
  selected: string[]
  aborted: boolean
  source: 'all' | 'with' | 'existing' | 'interactive' | 'default'
}

export function parseWithFlag(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function validateTier3Names(names: readonly string[]): {
  valid: string[]
  invalid: string[]
} {
  const valid: string[] = []
  const invalid: string[] = []
  const allowed: ReadonlySet<string> = new Set<string>(TIER3_SKILLS)
  for (const name of names) {
    if (allowed.has(name)) valid.push(name)
    else invalid.push(name)
  }
  return { valid, invalid }
}

export async function resolveTier3Selection(
  input: ResolveSkillsInput,
): Promise<ResolveSkillsResult> {
  if (input.allFlag) {
    return { selected: [...TIER3_SKILLS], aborted: false, source: 'all' }
  }

  if (input.withFlag !== undefined) {
    const requested = parseWithFlag(input.withFlag)
    const { valid, invalid } = validateTier3Names(requested)
    if (invalid.length > 0) {
      throw new Error(
        `Unknown Tier-3 skills: ${invalid.join(', ')}\nAvailable: ${TIER3_SKILLS.join(', ')}`,
      )
    }
    return { selected: valid, aborted: false, source: 'with' }
  }

  if (input.existing && input.existing.length > 0) {
    const { valid } = validateTier3Names(input.existing)
    return { selected: valid, aborted: false, source: 'existing' }
  }

  if (input.yesFlag || !input.isTTY) {
    return { selected: [...DEFAULT_TIER3_SKILLS], aborted: false, source: 'default' }
  }

  return interactivePrompt(input)
}

async function interactivePrompt(input: ResolveSkillsInput): Promise<ResolveSkillsResult> {
  const rl = createInterface({
    input: input.inputStream ?? process.stdin,
    output: input.outputStream ?? process.stdout,
  })
  const selected: string[] = []
  try {
    ;(input.outputStream ?? process.stdout).write(
      'Tier-3 skill selection (press Enter to skip, y to include, q to abort):\n',
    )
    for (const skill of TIER3_SKILLS) {
      const answer = (await rl.question(`  include ${skill}? [y/N/q] `)).trim().toLowerCase()
      if (answer === 'q') {
        return { selected: [], aborted: true, source: 'interactive' }
      }
      if (answer === 'y' || answer === 'yes') selected.push(skill)
    }
    return { selected, aborted: false, source: 'interactive' }
  } finally {
    rl.close()
  }
}
