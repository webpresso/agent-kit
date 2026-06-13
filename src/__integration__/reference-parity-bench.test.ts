import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_SESSION_MEMORY_THRESHOLDS,
  runBenchSessionMemoryCommand,
  type RunBenchSessionMemoryDeps,
} from '#cli/commands/bench/session-memory.js'

const manifest = {
  bun: '1.2.3',
  claude: '1.0.0',
  node: 'v24.0.0',
  model: 'claude-sonnet-4-5',
  plugins: {
    main: 'sha-main',
    v1: 'sha-v1',
    v2: 'sha-v2',
  },
}

const scenario = {
  scenario_id: 'debug-long-session',
  description: 'debug',
  worst_case_token_count: 210000,
  prompt_turns: [
    {
      session_id: 's1',
      turn_idx: 0,
      role: 'user' as const,
      text: 'inspect issue',
      estimated_tokens: 1000,
    },
  ],
  expected_tool_calls: ['search_files'],
  qrels: [{ question: 'q1', expected_substring_in_response: 'a1' }],
}

function deps(): RunBenchSessionMemoryDeps {
  return {
    aggregateCosts: vi.fn(() => ({ mean: 0, std: 0, n: 0, total: 0 })),
    captureManifest: vi.fn(async () => manifest),
    loadAllScenarios: vi.fn(() => [scenario]),
    loadManifest: vi.fn(() => manifest),
    loadPricing: vi.fn(() => ({})),
    resolveWorkspaceConfig: vi.fn(() => ({
      mode: 'single-workspace' as const,
      cacheDisclaimer: null,
      keyEnvNames: ['REFERENCE_API_KEY'],
      adminVerification: 'not-applicable' as const,
    })),
    resolveWorkspaceIdentitiesFromEnv: vi.fn(() => []),
    runCell: vi.fn(),
    validateKnownAnthropicWorkspaces: vi.fn(async () => {}),
    validateWorkspaceKeyPresence: vi.fn(),
    verifyManifest: vi.fn(),
    writeReport: vi.fn(),
  }
}

describe('reference parity bench dry-run', () => {
  it('validates continuity and search threshold schema without API calls', async () => {
    const runtime = deps()
    const result = await runBenchSessionMemoryCommand(
      {
        dryRun: true,
        scenario: 'debug-long-session',
        variant: 'baseline',
        env: { BENCH_WORKSPACE_MODE: 'single-workspace' },
      },
      runtime,
    )

    expect(runtime.runCell).not.toHaveBeenCalled()
    expect(runtime.validateWorkspaceKeyPresence).not.toHaveBeenCalled()
    expect(result.thresholdReport).toEqual({
      mode: 'dry-run',
      axes: [
        {
          id: 'post_tool_capture_latency_ms',
          label: 'PostToolUse capture latency',
          metric: 'latency_ms',
          threshold: DEFAULT_SESSION_MEMORY_THRESHOLDS.postToolCaptureLatencyMs,
          observed: null,
          status: 'schema-valid',
        },
        {
          id: 'precompact_snapshot_latency_ms',
          label: 'PreCompact snapshot latency',
          metric: 'latency_ms',
          threshold: DEFAULT_SESSION_MEMORY_THRESHOLDS.precompactSnapshotLatencyMs,
          observed: null,
          status: 'schema-valid',
        },
        {
          id: 'startup_resume_injection_latency_ms',
          label: 'SessionStart resume injection latency',
          metric: 'latency_ms',
          threshold: DEFAULT_SESSION_MEMORY_THRESHOLDS.startupResumeInjectionLatencyMs,
          observed: null,
          status: 'schema-valid',
        },
        {
          id: 'search_quality_recall_at_5',
          label: 'Search quality recall@5',
          metric: 'recall_at_5',
          threshold: DEFAULT_SESSION_MEMORY_THRESHOLDS.searchQualityRecallAt5,
          observed: null,
          status: 'schema-valid',
        },
      ],
    })
  })
})
