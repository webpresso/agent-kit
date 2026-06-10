import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { getBenchSessionMemoryHelpText } from '#cli/commands/bench/index.js'
import {
  assertBenchSessionMemorySupportedRuntime,
  assertBenchRuntimeAssets,
  createRunId,
  resolveBenchRuntimeRoot,
  resolveRepoRoot,
  runBenchSessionMemoryCommand,
} from '#cli/commands/bench/session-memory.js'

type TestManifest = {
  bun: string
  claude: string
  node: string
  model: string
  plugins: { main: string; v1: string; v2: string }
}

const TEST_MANIFEST: TestManifest = {
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

const TEST_SCENARIO = {
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
    {
      session_id: 's1',
      turn_idx: 1,
      role: 'assistant' as const,
      text: 'summary',
      estimated_tokens: 1000,
    },
    {
      session_id: 's1',
      turn_idx: 2,
      role: 'user' as const,
      text: 'answer recall',
      estimated_tokens: 1000,
    },
  ],
  expected_tool_calls: ['search_files'],
  qrels: [
    { question: 'q1', expected_substring_in_response: 'a1' },
    { question: 'q2', expected_substring_in_response: 'a2' },
    { question: 'q3', expected_substring_in_response: 'a3' },
    { question: 'q4', expected_substring_in_response: 'a4' },
    { question: 'q5', expected_substring_in_response: 'a5' },
  ],
}

function makeDeps(
  options: {
    onRunCell?: ReturnType<typeof vi.fn>
    onVerifyManifest?: ReturnType<typeof vi.fn>
    tempDir?: string
  } = {},
) {
  const runCell =
    options.onRunCell ??
    vi.fn(async () => ({
      ok: true as const,
      usage: {
        input_tokens: 10,
        output_tokens: 2,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        duration_ms: 500,
      },
      tools: ['search_files'],
      transcript_path: '/tmp/transcript.jsonl',
      home_dir: '/tmp/home',
    }))

  const verifyManifest = options.onVerifyManifest ?? vi.fn()

  return {
    aggregateCosts: vi.fn(() => ({ mean: 0.123, std: 0, n: 1, total: 0.123 })),
    captureManifest: vi.fn(async () => TEST_MANIFEST),
    loadAllScenarios: vi.fn(() => [TEST_SCENARIO]),
    loadManifest: vi.fn(() => TEST_MANIFEST),
    loadPricing: vi.fn(() => ({ version: 1 })),
    resolveWorkspaceConfig: vi.fn(() => ({
      mode: 'single-workspace' as const,
      cacheDisclaimer: 'cache-disabled baseline',
      keyEnvNames: ['ANTHROPIC_API_KEY'],
      adminVerification: 'not-applicable' as const,
    })),
    resolveWorkspaceIdentitiesFromEnv: vi.fn(() => []),
    runCell,
    validateKnownAnthropicWorkspaces: vi.fn(async () => {}),
    validateWorkspaceKeyPresence: vi.fn(),
    verifyManifest,
    writeReport: vi.fn((report, outPath: string) => {
      const text = [
        '# Session-memory benchmark',
        '',
        '| scenario | variant | trials | status | cost_usd | recall@5 | wall_sec |',
        '| --- | --- | ---: | --- | ---: | ---: | ---: |',
        ...report.cells.map(
          (cell) =>
            `| ${cell.scenario_id} | ${cell.variant} | ${cell.trials} | ${cell.status} | ${cell.cost_usd} | ${cell.recall_at_5} | ${cell.wall_sec} |`,
        ),
        '',
      ].join('\n')
      mkdirSync(dirname(outPath), { recursive: true })
      writeFileSync(outPath, text, 'utf8')
    }),
  }
}

describe('wp bench session-memory', () => {
  let dir: string

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
    vi.restoreAllMocks()
  })

  it('documents dry-run and single-cell examples', () => {
    expect(getBenchSessionMemoryHelpText()).toContain('wp bench session-memory --dry-run')
    expect(getBenchSessionMemoryHelpText()).toContain(
      '--scenario debug-long-session --variant baseline --trials 1',
    )
  })

  it('creates deterministic run ids from the manifest hash', () => {
    expect(createRunId(TEST_MANIFEST)).toBe(createRunId(TEST_MANIFEST))
  })

  it('resolves the repo root from Bun single-file executable URLs using the fallback cwd', () => {
    dir = mkdtempSync(join(tmpdir(), 'bench-runtime-root-'))
    writeFileSync(join(dir, 'package.json'), '{"name":"runtime-root"}\n', 'utf8')

    expect(resolveRepoRoot('file:///$bunfs/root/wp', dir)).toBe(dir)
    expect(resolveRepoRoot('file:///__bunfs__/root/wp', dir)).toBe(dir)
  })

  it('requires bench source assets before loading runtime modules from a resolved root', () => {
    dir = mkdtempSync(join(tmpdir(), 'bench-runtime-root-missing-assets-'))
    writeFileSync(join(dir, 'package.json'), '{"name":"@webpresso/agent-kit"}\n', 'utf8')

    expect(() => assertBenchRuntimeAssets(dir)).toThrow(/requires bench source assets/)
    expect(() => resolveBenchRuntimeRoot('file:///$bunfs/root/wp', dir)).toThrow(
      /not available from the compiled single-file runtime/,
    )
  })

  it('refuses to resolve bench assets from Bun single-file caller cwd even when spoofed', () => {
    dir = mkdtempSync(join(tmpdir(), 'bench-runtime-root-spoofed-assets-'))
    writeFileSync(join(dir, 'package.json'), '{"name":"@webpresso/agent-kit"}\n', 'utf8')
    for (const file of [
      'scripts/bench/lib/manifest.ts',
      'scripts/bench/scenarios/_schema.ts',
      'scripts/bench/lib/cost-aggregator.ts',
      'scripts/bench/lib/variant-runner.ts',
      'scripts/bench/lib/report-writer.ts',
    ]) {
      const path = join(dir, file)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, 'export {}\n', 'utf8')
    }

    expect(() => resolveBenchRuntimeRoot('file:///$bunfs/root/wp', dir)).toThrow(
      /refuses to resolve benchmark assets from the caller cwd/,
    )
  })

  it('refuses actual session-memory execution from the compiled runtime lane', async () => {
    expect(() =>
      assertBenchSessionMemorySupportedRuntime({ WP_COMPILED_RUNTIME: '1' }),
    ).toThrow(/not available from the compiled runtime/)

    await expect(
      runBenchSessionMemoryCommand({
        dryRun: true,
        env: { WP_COMPILED_RUNTIME: '1' },
      }),
    ).rejects.toThrow(/refuses to execute source-dependent benchmark assets/)
  })

  it('succeeds in dry-run mode without API calls', async () => {
    const runCell = vi.fn()
    const deps = makeDeps({ onRunCell: runCell })

    const result = await runBenchSessionMemoryCommand(
      {
        dryRun: true,
        scenario: 'debug-long-session',
        variant: 'baseline',
        env: { BENCH_WORKSPACE_MODE: 'single-workspace', ANTHROPIC_API_KEY: 'test-key' },
      },
      deps,
    )

    expect(result.exitCode).toBe(0)
    expect(result.dryRun).toBe(true)
    expect(result.reportPath).toBeNull()
    expect(runCell).not.toHaveBeenCalled()
    expect(deps.verifyManifest).toHaveBeenCalled()
  })

  it('writes a report for a single scenario/variant run', async () => {
    dir = mkdtempSync(join(tmpdir(), 'bench-command-'))
    const deps = makeDeps()

    const result = await runBenchSessionMemoryCommand(
      {
        scenario: 'debug-long-session',
        variant: 'baseline',
        trials: 1,
        outputRoot: dir,
        env: { BENCH_WORKSPACE_MODE: 'single-workspace', ANTHROPIC_API_KEY: 'test-key' },
      },
      deps,
    )

    expect(result.exitCode).toBe(0)
    expect(result.reportPath).not.toBeNull()
    expect(existsSync(result.reportPath ?? '')).toBe(true)

    const report = readFileSync(result.reportPath ?? '', 'utf8')
    expect(report).toContain('cost_usd')
    expect(report).toContain('recall@5')
    expect(report).toContain('wall_sec')
    expect(report).toContain('| debug-long-session | baseline | 1 | ok |')
  })

  it('runs two trials per cell when --all-variants is enabled', async () => {
    dir = mkdtempSync(join(tmpdir(), 'bench-command-all-'))
    const runCell = vi.fn(async () => ({
      ok: true as const,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        duration_ms: 100,
      },
      tools: [],
      transcript_path: '/tmp/transcript.jsonl',
      home_dir: '/tmp/home',
    }))
    const deps = makeDeps({ onRunCell: runCell })

    await runBenchSessionMemoryCommand(
      {
        allVariants: true,
        scenario: 'debug-long-session',
        outputRoot: dir,
        env: {
          BENCH_WORKSPACE_MODE: 'single-workspace',
          ANTHROPIC_API_KEY: 'test-key',
          ANTHROPIC_API_KEY_V1: 'v1-key',
          ANTHROPIC_API_KEY_V2: 'v2-key',
          ANTHROPIC_API_KEY_CONTEXT_MODE: 'ctx-key',
        },
      },
      deps,
    )

    expect(runCell).toHaveBeenCalledTimes(8)
  })

  it('aborts cleanly when manifest verification fails', async () => {
    const deps = makeDeps({
      onVerifyManifest: vi.fn(() => {
        throw new Error('Manifest mismatch')
      }),
    })

    await expect(
      runBenchSessionMemoryCommand(
        {
          dryRun: true,
          env: { BENCH_WORKSPACE_MODE: 'single-workspace', ANTHROPIC_API_KEY: 'test-key' },
        },
        deps,
      ),
    ).rejects.toThrow('Manifest mismatch')
  })

  it('isolated mode requires explicit workspace ids even without an admin key', async () => {
    const deps = makeDeps()
    deps.resolveWorkspaceConfig = vi.fn(() => ({
      mode: 'isolated',
      cacheDisclaimer: 'operator-asserted workspace isolation',
      keyEnvNames: [
        'ANTHROPIC_API_KEY_BASELINE',
        'ANTHROPIC_API_KEY_CONTEXT_MODE',
        'ANTHROPIC_API_KEY_V1',
        'ANTHROPIC_API_KEY_V2',
      ],
      adminVerification: 'operator-asserted',
    }))
    deps.resolveWorkspaceIdentitiesFromEnv = vi.fn(() => {
      throw new Error('missing workspace ids')
    })

    await expect(
      runBenchSessionMemoryCommand(
        {
          dryRun: true,
          env: {
            BENCH_WORKSPACE_MODE: 'isolated',
            ANTHROPIC_API_KEY_BASELINE: 'a',
            ANTHROPIC_API_KEY_CONTEXT_MODE: 'b',
            ANTHROPIC_API_KEY_V1: 'c',
            ANTHROPIC_API_KEY_V2: 'd',
          },
        },
        deps,
      ),
    ).rejects.toThrow('missing workspace ids')
  })

  it('isolated mode without an admin key skips Anthropic admin verification', async () => {
    const deps = makeDeps()
    deps.resolveWorkspaceConfig = vi.fn(() => ({
      mode: 'isolated',
      cacheDisclaimer: 'operator-asserted workspace isolation',
      keyEnvNames: [
        'ANTHROPIC_API_KEY_BASELINE',
        'ANTHROPIC_API_KEY_CONTEXT_MODE',
        'ANTHROPIC_API_KEY_V1',
        'ANTHROPIC_API_KEY_V2',
      ],
      adminVerification: 'operator-asserted',
    }))
    deps.resolveWorkspaceIdentitiesFromEnv = vi.fn(() => [
      { apiKeyEnv: 'ANTHROPIC_API_KEY_BASELINE', workspaceId: 'ws-a' },
      { apiKeyEnv: 'ANTHROPIC_API_KEY_CONTEXT_MODE', workspaceId: 'ws-b' },
      { apiKeyEnv: 'ANTHROPIC_API_KEY_V1', workspaceId: 'ws-c' },
      { apiKeyEnv: 'ANTHROPIC_API_KEY_V2', workspaceId: 'ws-d' },
    ])

    await runBenchSessionMemoryCommand(
      {
        dryRun: true,
        env: {
          BENCH_WORKSPACE_MODE: 'isolated',
          ANTHROPIC_API_KEY_BASELINE: 'a',
          ANTHROPIC_API_KEY_CONTEXT_MODE: 'b',
          ANTHROPIC_API_KEY_V1: 'c',
          ANTHROPIC_API_KEY_V2: 'd',
          ANTHROPIC_WORKSPACE_ID_BASELINE: 'ws-a',
          ANTHROPIC_WORKSPACE_ID_CONTEXT_MODE: 'ws-b',
          ANTHROPIC_WORKSPACE_ID_V1: 'ws-c',
          ANTHROPIC_WORKSPACE_ID_V2: 'ws-d',
        },
      },
      deps,
    )

    expect(deps.validateKnownAnthropicWorkspaces).not.toHaveBeenCalled()
  })

  it('isolated mode with an admin key performs Anthropic admin verification', async () => {
    const deps = makeDeps()
    deps.resolveWorkspaceConfig = vi.fn(() => ({
      mode: 'isolated',
      cacheDisclaimer: null,
      keyEnvNames: [
        'ANTHROPIC_API_KEY_BASELINE',
        'ANTHROPIC_API_KEY_CONTEXT_MODE',
        'ANTHROPIC_API_KEY_V1',
        'ANTHROPIC_API_KEY_V2',
      ],
      adminVerification: 'required-for-proof',
    }))
    deps.resolveWorkspaceIdentitiesFromEnv = vi.fn(() => [
      { apiKeyEnv: 'ANTHROPIC_API_KEY_BASELINE', workspaceId: 'ws-a' },
      { apiKeyEnv: 'ANTHROPIC_API_KEY_CONTEXT_MODE', workspaceId: 'ws-b' },
      { apiKeyEnv: 'ANTHROPIC_API_KEY_V1', workspaceId: 'ws-c' },
      { apiKeyEnv: 'ANTHROPIC_API_KEY_V2', workspaceId: 'ws-d' },
    ])

    await runBenchSessionMemoryCommand(
      {
        dryRun: true,
        env: {
          BENCH_WORKSPACE_MODE: 'isolated',
          ANTHROPIC_ADMIN_KEY: 'admin-key',
          ANTHROPIC_API_KEY_BASELINE: 'a',
          ANTHROPIC_API_KEY_CONTEXT_MODE: 'b',
          ANTHROPIC_API_KEY_V1: 'c',
          ANTHROPIC_API_KEY_V2: 'd',
          ANTHROPIC_WORKSPACE_ID_BASELINE: 'ws-a',
          ANTHROPIC_WORKSPACE_ID_CONTEXT_MODE: 'ws-b',
          ANTHROPIC_WORKSPACE_ID_V1: 'ws-c',
          ANTHROPIC_WORKSPACE_ID_V2: 'ws-d',
        },
      },
      deps,
    )

    expect(deps.validateKnownAnthropicWorkspaces).toHaveBeenCalledWith(
      [
        { apiKeyEnv: 'ANTHROPIC_API_KEY_BASELINE', workspaceId: 'ws-a' },
        { apiKeyEnv: 'ANTHROPIC_API_KEY_CONTEXT_MODE', workspaceId: 'ws-b' },
        { apiKeyEnv: 'ANTHROPIC_API_KEY_V1', workspaceId: 'ws-c' },
        { apiKeyEnv: 'ANTHROPIC_API_KEY_V2', workspaceId: 'ws-d' },
      ],
      'admin-key',
    )
  })
})
