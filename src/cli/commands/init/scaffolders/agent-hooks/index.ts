/**
 * `agent-hooks` scaffolder — wires ak-* hooks into:
 *   - `.claude/settings.json` (Claude Code)
 *   - `.codex/hooks.json` (Codex CLI)
 *
 * Additive: never removes existing hooks, only ensures agent-kit's entries
 * are present. Uses installed bin paths so consumers don't need bun.
 *
 * Runs by default on every `ak setup`.
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { type MergeOptions, type MergeResult, patchJsonFile } from '#cli/commands/init/merge'
import {
  buildSkillTag,
  extractSkillHooks,
  isTaggedSkillHook,
  type SkillHook,
} from './skill-hooks.js'

// Claude Code uses $CLAUDE_PROJECT_DIR; Codex runs from repo root so relative path works.
//
// CC_BIN wraps the command in a guard so it exits 0 gracefully when node_modules
// hasn't been installed yet (e.g. a fresh worktree before `pnpm install` completes).
// Without the guard every hook fires an error on first session start in new worktrees.
const CC_BIN = (name: string) =>
  `[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" || true`
const CODEX_BIN = (name: string) => `./node_modules/.bin/${name}`

type HookEntry = { type: string; command: string; timeout?: number }
type HookGroup = { matcher?: string; hooks: HookEntry[] }
type HooksMap = Record<string, HookGroup[]>

// Canonical hook event names recognised by both Claude Code and Codex CLI.
// Used by `hoistTopLevelEvents` to identify legacy flat-form keys to migrate.
const HOOK_EVENT_NAMES = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
] as const

export type MatcherSet = {
  preToolUse: string
  postToolUse: string
}

function hasCommand(groups: HookGroup[], command: string): boolean {
  // Match by binary name substring so both old exact-path and new guarded forms are detected.
  const binName = command.match(/node_modules\/\.bin\/([\w-]+)/)?.[1]
  return groups.some((g) =>
    g.hooks.some((h) => {
      if (h.command === command) return true
      if (binName && commandInvokesBin(h.command, binName)) return true
      return false
    }),
  )
}

function commandInvokesBin(command: string, binName: string): boolean {
  const escaped = binName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const binPattern = new RegExp(`node_modules/\\.bin/${escaped}(?=$|["'\\s])`, 'u')
  return binPattern.test(command)
}

function ensureGroup(groups: HookGroup[], group: HookGroup): HookGroup[] {
  if (hasCommand(groups, group.hooks[0]!.command)) return groups
  return [...groups, group]
}

function orderStopGroups(groups: HookGroup[]): HookGroup[] {
  return [...groups].sort((left, right) => {
    const leftCommand = left.hooks[0]?.command ?? ''
    const rightCommand = right.hooks[0]?.command ?? ''
    const leftIsGlobalStop = leftCommand.includes('ak-stop-qa')
    const rightIsGlobalStop = rightCommand.includes('ak-stop-qa')
    if (leftIsGlobalStop === rightIsGlobalStop) return 0
    return leftIsGlobalStop ? 1 : -1
  })
}

function stripSkillManagedHooks(groups: HookGroup[] | undefined): HookGroup[] {
  return (groups ?? [])
    .map((group) => ({
      ...group,
      hooks: group.hooks.filter((hook) => !isTaggedSkillHook(hook.command)),
    }))
    .filter((group) => group.hooks.length > 0)
}

function materializeClaudeSkillCommand(skillHook: SkillHook): string {
  const tag = buildSkillTag(skillHook.skillName)
  if (skillHook.command.startsWith('ak ')) {
    const args = skillHook.command.slice(3)
    return `[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/ak" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/ak" ${args} || true ${tag}`
  }
  return `${skillHook.command} ${tag}`
}

function mergeSkillHooks(hooks: HooksMap, skillHooks: readonly SkillHook[]): HooksMap {
  const nextHooks = Object.fromEntries(
    Object.entries(hooks).map(([event, groups]) => [event, stripSkillManagedHooks(groups)]),
  ) as HooksMap

  for (const skillHook of skillHooks) {
    const groups = nextHooks[skillHook.event] ?? []
    nextHooks[skillHook.event] = ensureGroup(groups, {
      ...(skillHook.matcher ? { matcher: skillHook.matcher } : {}),
      hooks: [
        {
          type: 'command',
          command: materializeClaudeSkillCommand(skillHook),
          ...(skillHook.timeout ? { timeout: skillHook.timeout } : {}),
        },
      ],
    })
  }

  return nextHooks
}

// ── Shared agent-kit hook construction ───────────────────────────────────────

/**
 * Construct the canonical 5 ak-* hook groups (SessionStart, PreToolUse,
 * PostToolUse, UserPromptSubmit, Stop). Single source of truth — adding a
 * new ak-* hook is one append here and propagates to both surfaces.
 */
export function buildAgentKitHookGroups(input: {
  resolveBin: (name: string) => string
  matchers: MatcherSet
}): HooksMap {
  const { resolveBin, matchers } = input
  return {
    SessionStart: [
      {
        hooks: [{ type: 'command', command: resolveBin('ak-sessionstart-routing'), timeout: 5 }],
      },
      {
        hooks: [{ type: 'command', command: resolveBin('ak-check-dev-link'), timeout: 5 }],
      },
    ],
    PreToolUse: [
      {
        matcher: matchers.preToolUse,
        hooks: [{ type: 'command', command: resolveBin('ak-pretool-guard'), timeout: 5 }],
      },
    ],
    PostToolUse: [
      {
        matcher: matchers.postToolUse,
        hooks: [{ type: 'command', command: resolveBin('ak-post-tool'), timeout: 15 }],
      },
    ],
    UserPromptSubmit: [
      {
        hooks: [{ type: 'command', command: resolveBin('ak-guard-switch'), timeout: 5 }],
      },
    ],
    Stop: [
      {
        hooks: [{ type: 'command', command: resolveBin('ak-stop-qa') }],
      },
    ],
  }
}

function mergeAgentKitGroups(existing: HooksMap, addition: HooksMap): HooksMap {
  const result: HooksMap = { ...existing }
  for (const [event, groups] of Object.entries(addition)) {
    let target = result[event] ?? []
    for (const group of groups) {
      target = ensureGroup(target, group)
    }
    result[event] = target
  }
  return result
}

/**
 * Migration: Codex's canonical hooks.json schema is wrapped under a top-level
 * `hooks` key (matching Codex's official docs at
 * https://developers.openai.com/codex/hooks). Earlier versions of this
 * scaffolder wrote event keys at the top level, which Codex silently ignored.
 *
 * Move any top-level `SessionStart|PreToolUse|PostToolUse|UserPromptSubmit|Stop`
 * keys into `json.hooks`, deduping via `ensureGroup`, and delete the
 * legacy top-level keys. Idempotent.
 */
export function hoistTopLevelEvents(json: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...json }
  const wrapped: HooksMap = { ...((next.hooks ?? {}) as HooksMap) }
  let changed = false

  for (const event of HOOK_EVENT_NAMES) {
    const top = next[event]
    if (!Array.isArray(top)) continue
    const topGroups = top as HookGroup[]
    let merged = wrapped[event] ?? []
    for (const group of topGroups) {
      if (group?.hooks?.[0]?.command) {
        merged = ensureGroup(merged, group)
      }
    }
    wrapped[event] = merged
    delete next[event]
    changed = true
  }

  if (changed || next.hooks) next.hooks = wrapped
  return next
}

// ── Claude Code (.claude/settings.json) ──────────────────────────────────────

const CLAUDE_MATCHERS: MatcherSet = {
  preToolUse: 'Bash|Write|Edit|MultiEdit',
  postToolUse: 'Write|Edit|MultiEdit',
}

function patchClaudeSettings(
  existing: Record<string, unknown>,
  skillHooks: readonly SkillHook[],
): Record<string, unknown> {
  const withSkills = mergeSkillHooks((existing.hooks ?? {}) as HooksMap, skillHooks)
  const agentKit = buildAgentKitHookGroups({
    resolveBin: CC_BIN,
    matchers: CLAUDE_MATCHERS,
  })
  const merged = mergeAgentKitGroups(withSkills, agentKit)

  // Claude-only extras: gstack soft-warning at SessionStart (non-blocking)
  // and a Skill-matcher PreToolUse hook for stricter enforcement.
  const withClaudeExtras: HooksMap = {
    ...merged,
    SessionStart: ensureGroup(merged.SessionStart ?? [], {
      hooks: [
        {
          type: 'command',
          command: '"$CLAUDE_PROJECT_DIR/.claude/hooks/check-gstack-session.sh"',
          timeout: 2,
        },
      ],
    }),
    PreToolUse: ensureGroup(merged.PreToolUse ?? [], {
      matcher: 'Skill',
      hooks: [
        {
          type: 'command',
          command: '"$CLAUDE_PROJECT_DIR/.claude/hooks/check-gstack.sh"',
          timeout: 3,
        },
      ],
    }),
    Stop: orderStopGroups(merged.Stop ?? []),
  }

  const worktree = existing.worktree as Record<string, unknown> | undefined
  const symlinkDirectories = Array.isArray(worktree?.symlinkDirectories)
    ? worktree?.symlinkDirectories.filter((value): value is string => typeof value === 'string')
    : []
  const normalizedSymlinkDirectories = symlinkDirectories.includes('.claude')
    ? symlinkDirectories
    : [...symlinkDirectories, '.claude']

  return {
    ...existing,
    worktree: {
      ...worktree,
      symlinkDirectories: normalizedSymlinkDirectories,
    },
    hooks: withClaudeExtras,
  }
}

// ── Codex CLI (.codex/hooks.json) ────────────────────────────────────────────
// Schema is wrapped under top-level `hooks` (Codex docs: developers.openai.com/codex/hooks).
// File edits go through apply_patch; "Edit"/"Write" are accepted matcher aliases.

const CODEX_MATCHERS: MatcherSet = {
  preToolUse: 'Bash|Edit|Write',
  postToolUse: 'Edit|Write',
}

function patchCodexHooks(existing: Record<string, unknown>): Record<string, unknown> {
  const migrated = hoistTopLevelEvents(existing)
  const existingHooks = (migrated.hooks ?? {}) as HooksMap
  const agentKit = buildAgentKitHookGroups({
    resolveBin: CODEX_BIN,
    matchers: CODEX_MATCHERS,
  })
  return {
    ...migrated,
    hooks: mergeAgentKitGroups(existingHooks, agentKit),
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ScaffoldAgentHooksInput {
  repoRoot: string
  options: MergeOptions
}

export interface ScaffoldAgentHooksResult {
  claude: MergeResult
  codex: MergeResult
}

// Fast existence check — no network, no install, sub-10ms.
// Installation is handled by `ak setup` (gstack scaffolder runs by default).
const GSTACK_CHECK_SH = `#!/bin/sh
if [ -d "$HOME/.claude/skills/gstack/bin" ]; then
  exit 0
fi
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"gstack is not installed. Fix: run \`ak setup\` then restart Claude Code."}}\\n'
`

// SessionStart soft warning — emits additionalContext, never blocks.
const GSTACK_SESSION_SH = `#!/bin/sh
if [ -d "$HOME/.claude/skills/gstack/bin" ]; then
  exit 0
fi
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"WARNING: gstack is not installed. Skills like /browse, /qa, /ship are unavailable. Fix: run \`ak setup\` then restart."}}\n'
`

function ensureGstackHooks(repoRoot: string, options: MergeOptions = {}): void {
  if (options.dryRun) return
  const hooksDir = join(repoRoot, '.claude', 'hooks')
  mkdirSync(hooksDir, { recursive: true })

  const preToolPath = join(hooksDir, 'check-gstack.sh')
  if (!existsSync(preToolPath)) {
    writeFileSync(preToolPath, GSTACK_CHECK_SH, 'utf8')
    chmodSync(preToolPath, 0o755)
  }

  const sessionPath = join(hooksDir, 'check-gstack-session.sh')
  if (!existsSync(sessionPath)) {
    writeFileSync(sessionPath, GSTACK_SESSION_SH, 'utf8')
    chmodSync(sessionPath, 0o755)
  }
}

export function scaffoldAgentHooks(input: ScaffoldAgentHooksInput): ScaffoldAgentHooksResult {
  ensureGstackHooks(input.repoRoot, input.options)
  const skillHooks = extractSkillHooks(join(input.repoRoot, '.agent', 'skills'))
  return {
    claude: patchJsonFile(
      join(input.repoRoot, '.claude', 'settings.json'),
      (existing) => patchClaudeSettings(existing, skillHooks),
      input.options,
    ),
    codex: patchJsonFile(
      join(input.repoRoot, '.codex', 'hooks.json'),
      patchCodexHooks,
      input.options,
    ),
  }
}
