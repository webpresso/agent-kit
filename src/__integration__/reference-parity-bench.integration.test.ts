import { afterEach, describe, expect, it, vi } from 'vitest'

import { main } from '#cli/cli.js'

const originalArgv = [...process.argv]
const originalCompiledRuntime = process.env.WP_COMPILED_RUNTIME

async function runWpBenchDryRun(): Promise<{ code: number; stdout: string[]; stderr: string[] }> {
  const stdout: string[] = []
  const stderr: string[] = []

  vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
    stdout.push(String(message ?? ''))
  })
  vi.spyOn(console, 'info').mockImplementation((message?: unknown) => {
    stdout.push(String(message ?? ''))
  })
  vi.spyOn(console, 'error').mockImplementation((message?: unknown) => {
    stderr.push(String(message ?? ''))
  })

  delete process.env.WP_COMPILED_RUNTIME
  process.argv = ['node', 'wp', 'bench', 'session-memory', '--dry-run']
  const code = await main()

  return { code, stdout, stderr }
}

afterEach(() => {
  process.argv = [...originalArgv]
  if (originalCompiledRuntime === undefined) {
    delete process.env.WP_COMPILED_RUNTIME
  } else {
    process.env.WP_COMPILED_RUNTIME = originalCompiledRuntime
  }
  vi.restoreAllMocks()
})

describe('reference parity bench dry-run integration', () => {
  it('runs the real wp bench session-memory dry-run path without API calls or manifest drift', async () => {
    const result = await runWpBenchDryRun()

    expect(result.code).toBe(0)
    expect(result.stderr.join('\n')).not.toContain('Manifest mismatch')

    const parsed = JSON.parse(result.stdout.join('\n')) as {
      exitCode: number
      runId: string
      dryRun: boolean
      reportPath: string | null
      cellCount: number
      thresholdReport: {
        mode: 'dry-run'
        axes: Array<{ id: string; status: string; observed: unknown }>
      }
    }

    expect(parsed.exitCode).toBe(0)
    expect(parsed.runId).toMatch(/^[0-9a-f]{12}$/)
    expect(parsed.dryRun).toBe(true)
    expect(parsed.reportPath).toBeNull()
    expect(parsed.cellCount).toBe(3)
    expect(parsed.thresholdReport.mode).toBe('dry-run')
    expect(parsed.thresholdReport.axes.map((axis) => axis.id)).toEqual([
      'post_tool_capture_latency_ms',
      'precompact_snapshot_latency_ms',
      'startup_resume_injection_latency_ms',
      'search_quality_recall_at_5',
    ])
    expect(parsed.thresholdReport.axes.map((axis) => axis.status)).toEqual([
      'schema-valid',
      'schema-valid',
      'schema-valid',
      'schema-valid',
    ])
    expect(parsed.thresholdReport.axes.map((axis) => axis.observed)).toEqual([
      null,
      null,
      null,
      null,
    ])
  })
})
