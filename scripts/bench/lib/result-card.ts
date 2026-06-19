import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { classifyCardMetric } from './claim-class.js'
import type { MetricClass } from './claim-class.js'

export type ResultCardValidation = {
  readonly path: string
  readonly valid: boolean
  readonly errors: readonly string[]
  readonly referencedArtifactPaths: readonly string[]
  readonly metricClasses: readonly MetricClass[]
}

type MetricRow = {
  readonly metric: string
  readonly threshold: string
  readonly value: string
  readonly status: string
}

const REQUIRED_FIELD_PATTERNS: readonly [string, RegExp][] = [
  ['Command', /^Command:\s*\S.+$/imu],
  ['Git commit', /^Git commit:\s*[0-9a-f]{7,40}\b/imu],
  ['Run id', /^Run id:\s*\S.+$/imu],
  ['Raw run artifact', /^Raw run artifact:\s*\S.+$/imu],
  ['Scenario id', /^Scenario id:\s*\S.+$/imu],
  ['Variant set', /^Variant set:\s*\S.+$/imu],
  ['Trial count', /^Trial count:\s*\d+\s*$/imu],
  ['Workspace/auth mode', /^Workspace\/auth mode:\s*\S.+$/imu],
  ['Cache-isolation disclaimer', /^Cache-isolation disclaimer:\s*.+$/imu],
  ['Environment', /^Environment:\s*\S.+$/imu],
  ['Tool versions', /^Tool versions:\s*\S.+$/imu],
]

function normalizeCell(value: string): string {
  return value.trim().replace(/\\\|/gu, '|').replace(/\s+/gu, ' ')
}

function splitRow(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return []
  return trimmed
    .slice(1, -1)
    .split(/(?<!\\)\|/u)
    .map(normalizeCell)
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell))
}

function metricRows(markdown: string): MetricRow[] {
  const rows: MetricRow[] = []
  const lines = markdown.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const header = splitRow(lines[index] ?? '')
    if (header.length < 4) continue
    const normalizedHeader = header.map((cell) => cell.toLowerCase())
    const metricIndex = normalizedHeader.indexOf('metric')
    const axisIndex = normalizedHeader.indexOf('axis')
    const thresholdIndex = normalizedHeader.indexOf('threshold')
    const statusIndex = normalizedHeader.indexOf('status')
    const valueIndex = normalizedHeader.findIndex((cell) =>
      cell === 'result' || cell === 'observed' || cell === 'value',
    )
    if (metricIndex === -1 || thresholdIndex === -1 || valueIndex === -1 || statusIndex === -1) {
      continue
    }
    const separator = splitRow(lines[index + 1] ?? '')
    if (!isSeparatorRow(separator)) continue
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const cells = splitRow(lines[rowIndex] ?? '')
      if (cells.length === 0) break
      rows.push({
        metric: cells[axisIndex === -1 ? metricIndex : axisIndex] ?? '',
        threshold: cells[thresholdIndex] ?? '',
        value: cells[valueIndex] ?? '',
        status: cells[statusIndex] ?? '',
      })
    }
  }
  return rows
}

function artifactPaths(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((line) => line.match(/^Raw run artifact:\s*(\S.+?)\s*$/iu)?.[1]?.trim())
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
}

function equivalentNumberOrText(left: string, right: string): boolean {
  if (left === right) return true
  if (left.toLowerCase() === 'n/a' && right.toLowerCase() === 'n/a') return true
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber === rightNumber
}

function validateAgainstReport(
  cardRows: readonly MetricRow[],
  reportRows: readonly MetricRow[],
  errors: string[],
): void {
  for (const cardRow of cardRows) {
    const reportRow = reportRows.find((candidate) => candidate.metric === cardRow.metric)
    if (!reportRow) {
      errors.push(`metric ${cardRow.metric} missing from referenced raw report`)
      continue
    }
    if (!equivalentNumberOrText(cardRow.threshold, reportRow.threshold)) {
      errors.push(
        `${cardRow.metric} threshold ${cardRow.threshold} does not match report threshold ${reportRow.threshold}`,
      )
    }
    if (!equivalentNumberOrText(cardRow.value, reportRow.value)) {
      errors.push(
        `${cardRow.metric} result ${cardRow.value} does not match report observed ${reportRow.value}`,
      )
    }
    if (cardRow.status !== reportRow.status) {
      errors.push(`${cardRow.metric} status ${cardRow.status} does not match report ${reportRow.status}`)
    }
    if (
      cardRow.metric.endsWith('latency_ms') &&
      cardRow.value.toLowerCase() !== 'n/a' &&
      reportRow.status === 'not-instrumented'
    ) {
      errors.push(`${cardRow.metric} cannot be claimed from a not-instrumented report row`)
    }
  }
}

export function validateBenchmarkResultCard(
  cardPath: string,
  root = process.cwd(),
): ResultCardValidation {
  const absoluteCardPath = resolve(root, cardPath)
  const errors: string[] = []
  if (!existsSync(absoluteCardPath)) {
    return { path: cardPath, valid: false, errors: [`missing result card ${cardPath}`], referencedArtifactPaths: [], metricClasses: [] }
  }

  const markdown = readFileSync(absoluteCardPath, 'utf8')
  for (const [label, pattern] of REQUIRED_FIELD_PATTERNS) {
    if (!pattern.test(markdown)) errors.push(`missing ${label}`)
  }

  const paths = artifactPaths(markdown)
  if (paths.length === 0) errors.push('missing Raw run artifact')

  const rows = metricRows(markdown)
  if (rows.length === 0) errors.push('missing metric table with status column')

  for (const artifactPath of paths) {
    if (artifactPath.startsWith('/') || artifactPath.includes('..')) {
      errors.push(`raw artifact path must be repo-relative: ${artifactPath}`)
      continue
    }
    const absoluteArtifactPath = resolve(root, artifactPath)
    if (!existsSync(absoluteArtifactPath)) {
      errors.push(`missing raw artifact ${artifactPath}`)
      continue
    }
    const reportRows = metricRows(readFileSync(absoluteArtifactPath, 'utf8'))
    if (reportRows.length === 0) {
      errors.push(`raw artifact ${artifactPath} has no threshold metric table`)
      continue
    }
    validateAgainstReport(rows, reportRows, errors)
  }

  const uniqueClasses = [...new Set(rows.map((row) => classifyCardMetric({ name: row.metric, value: row.value })))]
  return { path: cardPath, valid: errors.length === 0, errors, referencedArtifactPaths: paths, metricClasses: uniqueClasses }
}

export function listBenchmarkResultCards(root = process.cwd()): string[] {
  const cardsRoot = resolve(root, 'docs/bench/result-cards')
  if (!existsSync(cardsRoot)) return []
  return readdirSync(cardsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
    .map((entry) => `docs/bench/result-cards/${entry.name}`)
    .toSorted()
}

export function listValidBenchmarkResultCards(root = process.cwd()): string[] {
  return listBenchmarkResultCards(root).filter(
    (cardPath) => validateBenchmarkResultCard(cardPath, root).valid,
  )
}

export const resultCardTestInternals = { metricRows }
