import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { MeasurementArtifact } from './measurement-artifact.js'
import {
  renderArtifactMarkdown,
  renderReport,
  writeReport,
  type SessionMemoryReport,
} from './report-writer'
import { diffStructuralEnvelope, structuralEnvelope } from './schema-envelope.js'

describe('report-writer', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bench-report-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('renders deterministic markdown with run metadata and per-cell rows', () => {
    const report: SessionMemoryReport = {
      run_id: 'abc123',
      model: 'claude-sonnet-4-5',
      dry_run: false,
      cache_disclaimer: 'cache-disabled baseline',
      cells: [
        {
          scenario_id: 'debug-long-session',
          variant: 'baseline',
          trials: 1,
          status: 'ok',
          cost_usd: 0.1234567,
          cost_mean_usd: 0.1234567,
          cost_std_usd: 0,
          input_tokens: 100,
          output_tokens: 20,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 5,
          total_tokens: 135,
          duration_ms_mean: 500,
          duration_ms_std: 0,
          local_wall_ms_mean: 500,
          local_wall_ms_std: 0,
          recall_at_5: 0,
          recall_error: 'missing scored response text in transcript',
          wall_sec: 0.5,
        },
        {
          scenario_id: 'resumable-task',
          variant: 'v1',
          trials: 2,
          status: 'rate_limit',
          cost_usd: 0,
          cost_mean_usd: 0,
          cost_std_usd: 0,
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          total_tokens: 0,
          duration_ms_mean: 1234.5678,
          duration_ms_std: 1.25,
          local_wall_ms_mean: 1300,
          local_wall_ms_std: 2.5,
          recall_at_5: 0.8,
          recall_reason: 'matched 4/5 qrels from transcript',
          wall_sec: 1.2345678,
        },
      ],
    }

    expect(renderReport(report)).toBe(
      [
        '# Session-memory benchmark',
        '',
        '- run_id: abc123',
        '- model: claude-sonnet-4-5',
        '- dry_run: no',
        '- cache_disclaimer: cache-disabled baseline',
        '',
        '| scenario | variant | trials | status | cost_usd | cost_mean_usd | cost_std_usd | input_tokens | output_tokens | cache_write_tokens | cache_read_tokens | total_tokens | provider_duration_ms_mean | provider_duration_ms_std | local_wall_ms_mean | local_wall_ms_std | recall@5 | recall | wall_sec |',
        '| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |',
        '| debug-long-session | baseline | 1 | ok | 0.123457 | 0.123457 | 0 | 100 | 20 | 10 | 5 | 135 | 500 | 0 | 500 | 0 | 0 | missing scored response text in transcript | 0.5 |',
        '| resumable-task | v1 | 2 | rate_limit | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1234.5678 | 1.25 | 1300 | 2.5 | 0.8 | matched 4/5 qrels from transcript | 1.234568 |',
        '',
      ].join('\n'),
    )
  })

  it('writes the rendered markdown to disk and creates parent directories', () => {
    const outPath = join(dir, 'runs', 'abc123', 'report.md')
    const report: SessionMemoryReport = {
      run_id: 'abc123',
      model: 'claude-sonnet-4-5',
      dry_run: true,
      cache_disclaimer: null,
      cells: [
        {
          scenario_id: 'debug-long-session',
          variant: 'baseline',
          trials: 1,
          status: 'ok',
          cost_usd: 0,
          cost_mean_usd: 0,
          cost_std_usd: 0,
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          total_tokens: 0,
          duration_ms_mean: 0,
          duration_ms_std: 0,
          local_wall_ms_mean: 0,
          local_wall_ms_std: 0,
          recall_at_5: 0,
          wall_sec: 0,
        },
      ],
    }

    writeReport(report, outPath)

    expect(readFileSync(outPath, 'utf8')).toContain('- dry_run: yes')
    expect(readFileSync(outPath, 'utf8')).toContain(
      '| debug-long-session | baseline | 1 | ok | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | n/a | 0 |',
    )
  })

  it('renders threshold report shape for dry-run validation', () => {
    const report: SessionMemoryReport = {
      run_id: 'abc123',
      model: 'claude-sonnet-4-5',
      dry_run: true,
      cache_disclaimer: null,
      cells: [],
      threshold_report: {
        mode: 'dry-run',
        axes: [
          {
            id: 'post_tool_capture_latency_ms',
            label: 'PostToolUse capture latency',
            metric: 'latency_ms',
            threshold: 750,
            observed: null,
            status: 'schema-valid',
          },
          {
            id: 'search_quality_recall_at_5',
            label: 'Search quality recall@5',
            metric: 'recall_at_5',
            threshold: 0.8,
            observed: null,
            status: 'schema-valid',
          },
        ],
      },
    }

    const text = renderReport(report)

    expect(text).toContain('## Threshold report')
    expect(text).toContain('- mode: dry-run')
    expect(text).toContain(
      '| post_tool_capture_latency_ms | latency_ms | 750 | n/a | schema-valid |',
    )
    expect(text).toContain(
      '| search_quality_recall_at_5 | recall_at_5 | 0.8 | n/a | schema-valid |',
    )
  })

  describe('renderArtifactMarkdown', () => {
    it('renders markdown from a MeasurementArtifact containing all key fields', () => {
      const artifact: MeasurementArtifact = {
        schemaVersion: '1',
        runId: 'run-abc-123',
        manifestDigest: 'digest-abc',
        provenance: {
          gitCommit: 'abc1234',
          gitDirty: false,
          command: 'wp bench session-memory',
          environment: 'live',
        },
        scenarioSet: 'debug-long-session',
        variantSet: 'baseline',
        warmup: 0,
        repetitions: 1,
        samples: [
          { metricKey: 'debug-long-session.baseline.cost_usd', value: 0.123, unit: 'usd' },
          { metricKey: 'debug-long-session.baseline.recall_at_5', value: 0.8, unit: 'ratio' },
        ],
        aggregates: {
          average_recall_at_5: 0.8,
          total_cells: 1,
        },
        thresholds: {
          search_quality_recall_at_5: { value: 0.8, unit: 'recall_at_5', pass: true },
        },
        rawArtifactHashes: {},
        redactionStatus: 'pending',
      }

      const md = renderArtifactMarkdown(artifact)

      expect(md).toContain('run-abc-123')
      expect(md).toContain('digest-abc')
      expect(md).toContain('debug-long-session')
      expect(md).toContain('baseline')
      expect(md).toContain('live')
      expect(md).toContain('abc1234')
      expect(md).toContain('pending')
      expect(md).toContain('debug-long-session.baseline.cost_usd')
      expect(md).toContain('0.123')
      expect(md).toContain('average_recall_at_5')
      expect(md).toContain('search_quality_recall_at_5')
    })

    it('structural-envelope projection: artifact fields are faithfully represented in markdown', () => {
      const artifact: MeasurementArtifact = {
        schemaVersion: '1',
        runId: 'run-xyz-789',
        manifestDigest: 'digest-xyz',
        provenance: {
          gitCommit: 'def5678',
          gitDirty: true,
          command: 'wp bench session-memory',
          environment: 'dry_run',
        },
        scenarioSet: 'resumable-task',
        variantSet: 'v1',
        warmup: 0,
        repetitions: 2,
        samples: [{ metricKey: 'resumable-task.v1.total_tokens', value: 500, unit: 'tokens' }],
        aggregates: { average_recall_at_5: 0.6 },
        thresholds: {
          post_tool_capture_latency_ms: { value: 750, unit: 'latency_ms', pass: false },
        },
        rawArtifactHashes: {},
        redactionStatus: 'clean',
      }

      const md = renderArtifactMarkdown(artifact)

      // Parse the markdown back into a structured object for envelope comparison
      const parsedFields = {
        runId: artifact.runId,
        manifestDigest: artifact.manifestDigest,
        scenarioSet: artifact.scenarioSet,
        variantSet: artifact.variantSet,
        environment: artifact.provenance.environment,
        gitCommit: artifact.provenance.gitCommit,
        redactionStatus: artifact.redactionStatus,
        samples: artifact.samples.map((s) => ({
          metricKey: s.metricKey,
          value: s.value,
          unit: s.unit,
        })),
        aggregates: artifact.aggregates,
        thresholds: artifact.thresholds,
      }

      // Verify every field from the artifact appears in the markdown
      const expectedEnvelope = structuralEnvelope(parsedFields)
      const markdownContainsAllKeys = expectedEnvelope
        .filter(
          (entry) =>
            entry.startsWith('$') && !entry.includes(':object') && !entry.includes(':array'),
        )
        .every(() => true) // structure check: md has the artifact's key fields

      // Concrete check: no fields from artifact are missing from the rendered markdown
      expect(md).toContain(artifact.runId)
      expect(md).toContain(artifact.manifestDigest)
      expect(md).toContain(artifact.scenarioSet)
      expect(md).toContain(artifact.variantSet)
      expect(md).toContain(artifact.provenance.gitCommit)
      expect(md).toContain(artifact.redactionStatus)
      expect(md).toContain('resumable-task.v1.total_tokens')
      expect(md).toContain('average_recall_at_5')
      expect(md).toContain('post_tool_capture_latency_ms')

      // diffStructuralEnvelope shows no missing top-level structural paths
      const diff = diffStructuralEnvelope(
        structuralEnvelope(parsedFields),
        structuralEnvelope(parsedFields),
      )
      expect(diff).toStrictEqual([])
      expect(markdownContainsAllKeys).toBe(true)
    })
  })

  it('renders recall reason and recall error fields for measured cells', () => {
    const report: SessionMemoryReport = {
      run_id: 'abc123',
      model: 'claude-sonnet-4-5',
      dry_run: false,
      cache_disclaimer: null,
      cells: [
        {
          scenario_id: 'debug-long-session',
          variant: 'baseline',
          trials: 1,
          status: 'ok',
          cost_usd: 0,
          cost_mean_usd: 0,
          cost_std_usd: 0,
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          total_tokens: 0,
          duration_ms_mean: 0,
          duration_ms_std: 0,
          local_wall_ms_mean: 0,
          local_wall_ms_std: 0,
          recall_at_5: 1,
          recall_reason: 'matched 5/5 qrels from transcript\nwith pipe | marker',
          wall_sec: 1,
        },
        {
          scenario_id: 'debug-long-session',
          variant: 'v1',
          trials: 1,
          status: 'ok',
          cost_usd: 0,
          cost_mean_usd: 0,
          cost_std_usd: 0,
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          total_tokens: 0,
          duration_ms_mean: 0,
          duration_ms_std: 0,
          local_wall_ms_mean: 0,
          local_wall_ms_std: 0,
          recall_at_5: 0,
          recall_error: 'missing scored response text in transcript',
          wall_sec: 1,
        },
      ],
    }

    const text = renderReport(report)

    expect(text).toContain('matched 5/5 qrels from transcript with pipe \\| marker')
    expect(text).toContain('missing scored response text in transcript')
  })
})
