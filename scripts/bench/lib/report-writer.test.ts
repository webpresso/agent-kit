import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { renderReport, writeReport, type SessionMemoryReport } from './report-writer'

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
          recall_at_5: 0,
          wall_sec: 0.5,
        },
        {
          scenario_id: 'resumable-task',
          variant: 'v1',
          trials: 2,
          status: 'rate_limit',
          cost_usd: 0,
          recall_at_5: 0.8,
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
        '| scenario | variant | trials | status | cost_usd | recall@5 | wall_sec |',
        '| --- | --- | ---: | --- | ---: | ---: | ---: |',
        '| debug-long-session | baseline | 1 | ok | 0.123457 | 0 | 0.5 |',
        '| resumable-task | v1 | 2 | rate_limit | 0 | 0.8 | 1.234568 |',
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
          recall_at_5: 0,
          wall_sec: 0,
        },
      ],
    }

    writeReport(report, outPath)

    expect(readFileSync(outPath, 'utf8')).toContain('- dry_run: yes')
    expect(readFileSync(outPath, 'utf8')).toContain(
      '| debug-long-session | baseline | 1 | ok | 0 | 0 | 0 |',
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
})
