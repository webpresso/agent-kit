import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSearch = vi.fn()
const mockExecuteSandboxed = vi.fn()

vi.mock('#session-memory/native-runtime', () => ({
  loadNativeSessionMemoryEngine: () => ({
    executeSandboxed: mockExecuteSandboxed,
  }),
}))

vi.mock('#session-memory/store', () => ({
  getStore: () => ({ search: mockSearch }),
}))

vi.mock('#session-memory/repo-hash', () => ({
  resolveSessionRepoHash: () => 'repohash12345678',
}))

describe('wp_session_batch_execute', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSearch.mockReset()
    mockExecuteSandboxed.mockReset()
  })

  it('runs multiple commands and aggregates query hits', async () => {
    mockExecuteSandboxed
      .mockResolvedValueOnce({ exitCode: 0, outputBytes: 3000, indexed: true, summary: 'one' })
      .mockResolvedValueOnce({ exitCode: 0, outputBytes: 100, indexed: false, summary: 'two' })
    mockSearch.mockReturnValue([
      { content: 'shared result', source: 'cmd-a:4', rank: 1, tier: 'porter' },
    ])

    const tool = (await import('./_session-batch-execute.js')).default
    const result = await tool.handler?.({
      commands: [
        { label: 'cmd-a', command: 'seq 1 600' },
        { label: 'cmd-b', command: 'echo ok' },
      ],
      queries: ['shared'],
      concurrency: 2,
      execute: true,
      timeoutMs: 4567,
      cwd: '/tmp/worktree-b',
    })

    expect(result?.structuredContent).toMatchObject({
      passed: true,
      details: {
        results: [
          { label: 'cmd-a', indexed: true },
          { label: 'cmd-b', indexed: false },
        ],
        queryHits: {
          shared: [{ content: 'shared result' }],
        },
      },
    })
    expect(mockExecuteSandboxed).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      'seq 1 600',
      'cmd-a',
      4567,
      '/tmp/worktree-b',
    )
  })

  it('surfaces failures when any command fails', async () => {
    mockExecuteSandboxed.mockResolvedValue({
      exitCode: 42,
      outputBytes: 20,
      indexed: false,
      summary: 'bad',
    })
    const tool = (await import('./_session-batch-execute.js')).default
    const result = await tool.handler?.({
      commands: [{ label: 'cmd', command: 'exit 42' }],
      concurrency: 1,
      execute: true,
    })
    expect(result?.structuredContent).toMatchObject({ passed: false })
  })

  it('rejects duplicate labels in one batch', async () => {
    const tool = (await import('./_session-batch-execute.js')).default
    await expect(
      tool.handler?.({
        commands: [
          { label: 'dup', command: 'echo one' },
          { label: 'dup', command: 'echo two' },
        ],
        execute: true,
      }),
    ).rejects.toBeTruthy()
  })

  it('requires explicit execute=true before running shell commands', async () => {
    const tool = (await import('./_session-batch-execute.js')).default
    const result = await tool.handler?.({ commands: [{ label: 'cmd', command: 'echo nope' }] })
    expect(mockExecuteSandboxed).not.toHaveBeenCalled()
    expect(result?.structuredContent).toMatchObject({ passed: false })
  })
})
