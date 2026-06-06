#!/usr/bin/env bun
/**
 * SessionStart hook: warn loud when webpresso dev-link is broken.
 *
 * Cross-runtime — emits the additionalContext envelope shared by Claude Code
 * (docs.claude.com/en/docs/claude-code/hooks) and Codex CLI
 * (developers.openai.com/codex/hooks). Both runtimes inject `additionalContext`
 * into the session's developer context.
 *
 * Catches the rare path where `vp install --ignore-scripts` skipped the
 * consumer's `wp-restore-dev-links` postinstall, leaving
 * node_modules/webpresso pointed at the pnpm-store snapshot
 * instead of the live source declared in `.webpresso/webpresso-dev-link.json`.
 * Always exits 0; never blocks session start.
 */
import { readlinkSync } from 'node:fs'
import { join } from 'node:path'

import { STATE_FILE_RELATIVE_PATH, type DevLinkState, readDevLinkState } from '#dev/dev-link-state'
import { isDirectEntrypoint } from '#hooks/shared/direct-entrypoint'

export interface DevLinkBreakage {
  expected: string
  actual: string | null
  packageName: string
  projectDir: string
}

export interface DetectOptions {
  cwd?: string
}

export function detectDevLinkBreakage(options: DetectOptions = {}): DevLinkBreakage | null {
  const cwd = options.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  const state = readDevLinkState(cwd)
  if (state === null) return null

  const target = join(cwd, 'node_modules', state.package)
  let actual: string | null
  try {
    actual = readlinkSync(target)
  } catch {
    actual = null
  }
  if (actual === state.linkedFrom) return null

  return {
    expected: state.linkedFrom,
    actual,
    packageName: state.package,
    projectDir: cwd,
  }
}

export function formatBreakageMessage(breakage: DevLinkBreakage): string {
  const actualLabel = breakage.actual ?? '<store snapshot>'
  return [
    `WARNING: ${breakage.packageName} dev-link is broken.`,
    `State file (${STATE_FILE_RELATIVE_PATH}) says linkedFrom=${breakage.expected} but node_modules/${breakage.packageName} -> ${actualLabel}.`,
    'Hooks will run STALE code.',
    `Fix: run \`vp install\` (postinstall wp-restore-dev-links re-creates the symlink), or from the webpresso checkout: \`vp run dev:link --consumer ${breakage.projectDir}\`.`,
  ].join(' ')
}

export function buildSessionStartEnvelope(message: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: message,
    },
  })
}

export function buildOutput(cwd: string): string | null {
  const breakage = detectDevLinkBreakage({ cwd })
  if (breakage === null) return null
  return buildSessionStartEnvelope(formatBreakageMessage(breakage))
}

export async function main(): Promise<void> {
  // Drain stdin if attached — Claude Code and Codex both pipe the hook
  // payload here. We don't read it (cwd is enough) but a closed stdin
  // can break upstream pipes if the caller is still writing.
  if (!process.stdin.isTTY) {
    await new Promise<void>((resolve) => {
      process.stdin.on('data', () => undefined)
      process.stdin.on('end', resolve)
      process.stdin.on('error', resolve)
    })
  }
  const out = buildOutput(process.cwd())
  if (out !== null) process.stdout.write(`${out}\n`)
  process.exit(0)
}

if (
  isDirectEntrypoint(import.meta.url)
) {
  void main()
}

// Re-export so tests can stub the state file path if needed in future.
export { STATE_FILE_RELATIVE_PATH, readDevLinkState }
export type { DevLinkState }
