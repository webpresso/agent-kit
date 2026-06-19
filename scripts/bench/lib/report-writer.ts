import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { MeasurementArtifact } from './measurement-artifact.js'
import { serializeMeasurementArtifact } from './measurement-artifact.js'

export type SessionMemoryReportCell = {
  scenario_id: string
  variant: string
  trials: number
  status: 'ok' | 'rate_limit' | 'spawn_failed'
  cost_usd: number
  cost_mean_usd: number
  cost_std_usd: number
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  total_tokens: number
  duration_ms_mean: number
  duration_ms_std: number
  local_wall_ms_mean: number
  local_wall_ms_std: number
  recall_at_5: number
  recall_reason?: string
  recall_error?: string
  wall_sec: number
}

export type SessionMemoryThresholdAxis = {
  id: string
  label: string
  metric: 'latency_ms' | 'recall_at_5'
  threshold: number
  observed: number | null
  status: 'schema-valid' | 'not-instrumented' | 'passed' | 'failed'
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

function formatMarkdownCell(value: string | undefined): string {
  return (value ?? 'n/a').replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|')
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
    '| scenario | variant | trials | status | cost_usd | cost_mean_usd | cost_std_usd | input_tokens | output_tokens | cache_write_tokens | cache_read_tokens | total_tokens | provider_duration_ms_mean | provider_duration_ms_std | local_wall_ms_mean | local_wall_ms_std | recall@5 | recall | wall_sec |',
    '| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |',
    ...report.cells.map(
      (cell) =>
        `| ${cell.scenario_id} | ${cell.variant} | ${cell.trials} | ${cell.status} | ${formatNumber(cell.cost_usd)} | ${formatNumber(cell.cost_mean_usd)} | ${formatNumber(cell.cost_std_usd)} | ${formatNumber(cell.input_tokens)} | ${formatNumber(cell.output_tokens)} | ${formatNumber(cell.cache_creation_input_tokens)} | ${formatNumber(cell.cache_read_input_tokens)} | ${formatNumber(cell.total_tokens)} | ${formatNumber(cell.duration_ms_mean)} | ${formatNumber(cell.duration_ms_std)} | ${formatNumber(cell.local_wall_ms_mean)} | ${formatNumber(cell.local_wall_ms_std)} | ${formatNumber(cell.recall_at_5)} | ${formatMarkdownCell(cell.recall_error ?? cell.recall_reason)} | ${formatNumber(cell.wall_sec)} |`,
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

export function renderArtifactMarkdown(artifact: MeasurementArtifact): string {
  const lines = [
    '# Session-memory benchmark',
    '',
    `- run_id: ${artifact.runId}`,
    `- manifest_digest: ${artifact.manifestDigest}`,
    `- scenario_set: ${artifact.scenarioSet}`,
    `- variant_set: ${artifact.variantSet}`,
    `- environment: ${artifact.provenance.environment}`,
    `- git_commit: ${artifact.provenance.gitCommit}`,
    `- git_dirty: ${artifact.provenance.gitDirty ? 'yes' : 'no'}`,
    `- warmup: ${artifact.warmup}`,
    `- repetitions: ${artifact.repetitions}`,
    `- redaction_status: ${artifact.redactionStatus}`,
    '',
    '## Samples',
    '',
    '| metric_key | value | unit |',
    '| --- | ---: | --- |',
    ...artifact.samples.map(
      (sample) =>
        `| ${sample.metricKey} | ${formatNumber(sample.value)} | ${sample.unit} |`,
    ),
    '',
    '## Aggregates',
    '',
    '| key | value |',
    '| --- | ---: |',
    ...Object.entries(artifact.aggregates).map(
      ([key, value]) => `| ${key} | ${formatNumber(value)} |`,
    ),
    '',
    '## Thresholds',
    '',
    '| key | value | unit | pass |',
    '| --- | ---: | --- | --- |',
    ...Object.entries(artifact.thresholds).map(
      ([key, threshold]) =>
        `| ${key} | ${formatNumber(threshold.value)} | ${threshold.unit} | ${threshold.pass ? 'yes' : 'no'} |`,
    ),
    '',
  ]

  return lines.join('\n')
}

export function writeArtifactJson(artifact: MeasurementArtifact, outPath: string): void {
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, serializeMeasurementArtifact(artifact), 'utf8')
}
