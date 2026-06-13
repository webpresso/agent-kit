import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export type SessionMemoryReportCell = {
  scenario_id: string
  variant: string
  trials: number
  status: 'ok' | 'rate_limit' | 'spawn_failed'
  cost_usd: number
  recall_at_5: number
  wall_sec: number
}

export type SessionMemoryThresholdAxis = {
  id: string
  label: string
  metric: 'latency_ms' | 'recall_at_5'
  threshold: number
  observed: number | null
  status: 'schema-valid' | 'passed' | 'failed'
}

export type SessionMemoryReport = {
  run_id: string
  model: string
  dry_run: boolean
  cache_disclaimer: string | null
  cells: SessionMemoryReportCell[]
  threshold_report?: {
    mode: 'dry-run' | 'measured'
    axes: readonly SessionMemoryThresholdAxis[]
  }
}

function formatNumber(value: number): string {
  return Number(value.toFixed(6)).toString()
}

export function renderReport(report: SessionMemoryReport): string {
  const lines = [
    '# Session-memory benchmark',
    '',
    `- run_id: ${report.run_id}`,
    `- model: ${report.model}`,
    `- dry_run: ${report.dry_run ? 'yes' : 'no'}`,
    `- cache_disclaimer: ${report.cache_disclaimer ?? 'none'}`,
    '',
    '| scenario | variant | trials | status | cost_usd | recall@5 | wall_sec |',
    '| --- | --- | ---: | --- | ---: | ---: | ---: |',
    ...report.cells.map(
      (cell) =>
        `| ${cell.scenario_id} | ${cell.variant} | ${cell.trials} | ${cell.status} | ${formatNumber(cell.cost_usd)} | ${formatNumber(cell.recall_at_5)} | ${formatNumber(cell.wall_sec)} |`,
    ),
    '',
    ...(report.threshold_report
      ? [
          '## Threshold report',
          '',
          `- mode: ${report.threshold_report.mode}`,
          '',
          '| axis | metric | threshold | observed | status |',
          '| --- | --- | ---: | ---: | --- |',
          ...report.threshold_report.axes.map(
            (axis) =>
              `| ${axis.id} | ${axis.metric} | ${formatNumber(axis.threshold)} | ${axis.observed === null ? 'n/a' : formatNumber(axis.observed)} | ${axis.status} |`,
          ),
          '',
        ]
      : []),
  ]

  return lines.join('\n')
}

export function writeReport(report: SessionMemoryReport, outPath: string): void {
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, renderReport(report), 'utf8')
}
