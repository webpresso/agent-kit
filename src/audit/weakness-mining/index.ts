import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import type { RepoAuditResult, RepoAuditViolation } from '#audit/repo-guardrails'
import { detectEvidenceGap, type EvidenceGapRecord } from './evidence-gap.js'
import { readPretoolEvidence, type PretoolLogRecord, type ReadPretoolEvidenceOptions } from './read-pretool-log.js'

export interface WeaknessMiningFinding {
  id: string
  kind: 'repeated-block' | 'repeated-error'
  severity: 'medium' | 'high'
  surfaceId: string
  tool: string
  target: string
  occurrences: number
  files: string[]
  message: string
}

export interface WeaknessMiningReport {
  ok: boolean
  checked: number
  findings: WeaknessMiningFinding[]
  evidenceGap: EvidenceGapRecord | null
  warnings: string[]
}

export interface WeaknessMiningOptions extends ReadPretoolEvidenceOptions {
  draftTechDebt?: boolean
}

export async function auditWeaknessMining(
  rootDirectory: string = process.cwd(),
  options: WeaknessMiningOptions = {},
): Promise<RepoAuditResult> {
  const report = mineWeaknesses(rootDirectory, options)
  const violations: RepoAuditViolation[] = report.findings.map((finding) => ({
    file: finding.files[0],
    message: `${finding.id}: ${finding.message}`,
  }))

  if (options.draftTechDebt && report.findings.length > 0) {
    const draftPath = await writeWeaknessMiningTechDebtDraft(rootDirectory, report.findings)
    violations.push({
      file: draftPath,
      message: `Drafted tech-debt item for weakness-mining findings: ${draftPath}`,
    })
  }

  return {
    ok: violations.length === 0,
    title: 'Weakness mining audit',
    checked: report.checked,
    violations,
  }
}

export function mineWeaknesses(
  rootDirectory: string = process.cwd(),
  options: WeaknessMiningOptions = {},
): WeaknessMiningReport {
  const readResult = readPretoolEvidence(rootDirectory, options)
  const evidenceGap = detectEvidenceGap(readResult)
  const findings = evidenceGap ? [] : buildFindings(readResult.records)
  return {
    ok: findings.length === 0,
    checked: readResult.records.length,
    findings,
    evidenceGap,
    warnings: readResult.warnings,
  }
}

function buildFindings(records: readonly PretoolLogRecord[]): WeaknessMiningFinding[] {
  const groups = new Map<string, PretoolLogRecord[]>()
  for (const record of records) {
    if (record.status !== 'BLOCK' && record.status !== 'ERROR') continue
    const normalizedTarget = normalizeTarget(record.target)
    const failureKey = record.failures?.join(',') ?? record.error ?? record.status
    const key = [record.status, record.tool, normalizedTarget, failureKey].join('\0')
    const group = groups.get(key) ?? []
    group.push(record)
    groups.set(key, group)
  }

  const findings: WeaknessMiningFinding[] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const first = group[0]
    if (!first) continue
    const kind = first.status === 'ERROR' ? 'repeated-error' : 'repeated-block'
    const failures = first.failures?.length ? ` (${first.failures.join(', ')})` : ''
    const target = normalizeTarget(first.target)
    const id = `WM-${createHash('sha1').update(`${kind}:${first.tool}:${target}:${failures}`).digest('hex').slice(0, 8)}`
    findings.push({
      id,
      kind,
      severity: kind === 'repeated-error' ? 'high' : 'medium',
      surfaceId: 'codex-hooks',
      tool: first.tool,
      target,
      occurrences: group.length,
      files: [...new Set(group.map((record) => `${record.sourceFile}:${record.lineNumber}`))],
      message: `${group.length} repeated ${first.status} ${first.tool} pretool records for ${target}${failures}`,
    })
  }

  return findings.sort((left, right) => left.id.localeCompare(right.id))
}

function normalizeTarget(target: string): string {
  return target.replace(/\s+/gu, ' ').trim().slice(0, 160)
}

async function writeWeaknessMiningTechDebtDraft(
  rootDirectory: string,
  findings: readonly WeaknessMiningFinding[],
): Promise<string> {
  const root = resolve(rootDirectory)
  const statusDir = join(root, 'tech-debt', 'needs-remediation')
  await mkdir(statusDir, { recursive: true })
  const hash = createHash('sha256').update(JSON.stringify(findings)).digest('hex').slice(0, 16)
  const filePath = join(statusDir, `h-weakness-mining-${hash}.md`)
  if (existsSync(filePath)) return filePath
  const today = new Date().toISOString().slice(0, 10)
  const body = [
    '---',
    'type: tech-debt',
    'status: needs-remediation',
    'severity: medium',
    'category: testing',
    'review_cadence: biweekly',
    `last_reviewed: '${today}'`,
    `created: '${today}'`,
    `auto_filed_hash: weakness-mining-${hash}`,
    'linked_blueprints: []',
    'affected_modules:',
    '  - src/hooks',
    '---',
    '',
    '# Weakness-mining hook evidence findings',
    '',
    ...findings.map((finding) => `- ${finding.id}: ${finding.message} [${finding.surfaceId}]`),
    '',
  ].join('\n')
  await writeFile(filePath, body, { flag: 'wx' })
  return filePath
}
