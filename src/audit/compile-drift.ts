import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { hashAgentDir } from '#cli/commands/compile'
import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

interface StoredManifest {
  version: number
  timestamp: string
  sourceHash: string
  outputHashes: Record<string, string>
}

function readManifest(manifestPath: string): StoredManifest | null {
  if (!existsSync(manifestPath)) return null
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as StoredManifest
  } catch {
    return null
  }
}

export async function auditCompileDrift(cwd: string): Promise<RepoAuditResult> {
  const agentDir = join(cwd, '.agent')
  const manifestPath = join(agentDir, '.compile-manifest.json')
  const violations: RepoAuditViolation[] = []

  const manifest = readManifest(manifestPath)

  if (manifest === null) {
    // No manifest yet — not an error, just not compiled
    return {
      ok: true,
      title: 'compile drift',
      checked: 0,
      violations: [],
    }
  }

  const currentHash = hashAgentDir(agentDir)

  if (manifest.sourceHash !== currentHash) {
    violations.push({
      file: '.agent/.compile-manifest.json',
      message: `Compile drift detected — .agent/ has changed since last \`ak compile\` (stored hash: ${manifest.sourceHash.slice(0, 12)}…, current: ${currentHash.slice(0, 12)}…). Run \`ak compile\` to regenerate.`,
    })
  }

  return {
    ok: violations.length === 0,
    title: 'compile drift',
    checked: 1,
    violations,
  }
}
