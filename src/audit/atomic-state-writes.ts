import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

const TARGET_FILES = [
  'src/blueprint/freshness.ts',
  'src/mcp/blueprint-server.ts',
  'src/cli/commands/blueprint/db-commands.ts',
  'src/hooks/guard-switch/state.ts',
  'src/blueprint/utils/decision-trace-artifacts.ts',
  'src/cli/commands/config.ts',
  'src/cli/auto-update/installer.ts',
] as const

export function auditAtomicStateWrites(rootDirectory: string = process.cwd()): RepoAuditResult {
  const violations: RepoAuditViolation[] = []
  let checked = 0

  for (const relativeFile of TARGET_FILES) {
    const file = path.join(rootDirectory, relativeFile)
    if (!existsSync(file)) continue
    checked += 1
    const source = readFileSync(file, 'utf8')

    if (/\bwriteFileSync\s*\(/u.test(source)) {
      violations.push({
        file: relativeFile,
        message: 'state-bearing writes must use writeFileAtomic or writeJsonFile({ atomic: true })',
      })
    }

    for (const call of findCalls(source, 'writeJsonFile')) {
      if (!call.includes('atomic: true')) {
        violations.push({
          file: relativeFile,
          message: 'state-bearing writeJsonFile calls must pass { atomic: true }',
        })
      }
    }
  }

  return {
    ok: violations.length === 0,
    title: 'Atomic state writes',
    checked,
    violations,
  }
}

function findCalls(source: string, callee: string): string[] {
  const calls: string[] = []
  const pattern = new RegExp(`\\b${callee}\\s*\\(`, 'gu')
  for (const match of source.matchAll(pattern)) {
    const start = match.index
    if (start === undefined) continue
    let depth = 0
    let sawOpenParen = false
    for (let i = start; i < source.length; i += 1) {
      const char = source[i]
      if (char === '(') {
        sawOpenParen = true
        depth += 1
      }
      if (char === ')') depth -= 1
      if (sawOpenParen && depth === 0) {
        calls.push(source.slice(start, i + 1))
        break
      }
    }
  }
  return calls
}
