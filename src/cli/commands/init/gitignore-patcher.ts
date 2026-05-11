/**
 * Idempotent `.gitignore` patcher anchored by marker comments.
 *
 * Each managed block is wrapped between:
 *   # >>> managed by @webpresso/agent-kit (<id>)
 *   <patterns>
 *   # <<< managed by @webpresso/agent-kit (<id>)
 *
 * Re-running the patcher detects an existing block by id and either leaves
 * it alone (when content matches) or rewrites just that block (overwrite or
 * drift). Other content in `.gitignore` — including unrelated managed blocks
 * from other scaffolders — is preserved verbatim.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { MergeOptions, MergeResult } from './merge.js'

export interface GitignoreBlock {
  id: string
  patterns: readonly string[]
}

const BEGIN = (id: string): string => `# >>> managed by @webpresso/agent-kit (${id})`
const END = (id: string): string => `# <<< managed by @webpresso/agent-kit (${id})`

function renderBlock(block: GitignoreBlock): string {
  return [BEGIN(block.id), ...block.patterns, END(block.id)].join('\n')
}

function findBlock(content: string, id: string): { start: number; end: number } | null {
  const begin = BEGIN(id)
  const end = END(id)
  const lines = content.split('\n')
  let startLine = -1
  let endLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === begin && startLine === -1) startLine = i
    else if (lines[i] === end && startLine !== -1) {
      endLine = i
      break
    }
  }
  if (startLine === -1 || endLine === -1) return null
  return { start: startLine, end: endLine }
}

/** Canonical gitignore block for agent-kit generated/transient paths. */
export const GENERATED_PATHS_BLOCK: GitignoreBlock = {
  id: 'generated',
  patterns: [
    '.claude/skills/',
    '.codex/skills/',
    '.cursor/rules/',
    '.windsurf/rules/',
    '.gemini/commands/',
    '.opencode/agents/',
    '.opencode/commands/',
    '.agents/skills/',
    '.agent/.merged.provenance.json',
    '.agent/.compile-manifest.json',
    '.agent/.rotation-log.jsonl',
    '.agent/.blueprints.db',
    '.agent/.blueprints.lock',
    '.agent/.tail-hint-history.jsonl',
  ],
}

export function patchGitignore(
  targetPath: string,
  block: GitignoreBlock,
  opts: MergeOptions = {},
): MergeResult {
  const exists = existsSync(targetPath)
  const original = exists ? readFileSync(targetPath, 'utf8') : ''
  const rendered = renderBlock(block)

  let next: string
  let action: MergeResult['action']

  const found = findBlock(original, block.id)
  if (found) {
    const lines = original.split('\n')
    const currentBlock = lines.slice(found.start, found.end + 1).join('\n')
    if (currentBlock === rendered) {
      return { targetPath, action: 'identical' }
    }
    if (!opts.overwrite) {
      // Drift: existing block diverges from canonical content. Leave it alone
      // (consumer-edited) and surface drift.
      return { targetPath, action: 'drifted' }
    }
    const before = lines.slice(0, found.start)
    const after = lines.slice(found.end + 1)
    next = [...before, rendered, ...after].join('\n')
    action = 'overwritten'
  } else {
    if (original.length === 0) {
      next = `${rendered}\n`
    } else {
      const sep = original.endsWith('\n') ? '\n' : '\n\n'
      next = original.endsWith('\n')
        ? `${original}\n${rendered}\n`
        : `${original}${sep}${rendered}\n`
    }
    action = exists ? 'overwritten' : 'created'
  }

  if (opts.dryRun) {
    return { targetPath, action: 'skipped-dry' }
  }

  mkdirSync(dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, next)
  return { targetPath, action }
}
