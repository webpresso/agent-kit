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

describe('wp_session_execute', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSearch.mockReset()
    mockExecuteSandboxed.mockReset()
  })

  it('returns indexed search hits when a query is provided', async () => {
    mockExecuteSandboxed.mockResolvedValue({
      exitCode: 0,
      outputBytes: 4096,
      indexed: true,
      summary: 'large output summary',
    })
    mockSearch.mockReturnValue([
      { content: 'indexed chunk', source: 'label:2', rank: 1, tier: 'porter' },
    ])

    const tool = (await import('./_session-execute.js')).default
    const result = await tool.handler?.({
      command: 'seq 1 600',
      label: 'label',
      query: 'indexed',
      execute: true,
      timeoutMs: 1234,
      cwd: '/tmp/worktree-a',
    })
    expect(result?.structuredContent).toMatchObject({
      passed: true,
      details: {
        label: 'label',
        indexed: true,
        hits: [{ content: 'indexed chunk' }],
      },
    })
    expect(mockExecuteSandboxed).toHaveBeenCalledWith(
      expect.any(String),
      'seq 1 600',
      'label',
      1234,
      '/tmp/worktree-a',
    )
  })

  it('returns an error envelope when execution fails', async () => {
    mockExecuteSandboxed.mockRejectedValue(new Error('native boom'))
    const tool = (await import('./_session-execute.js')).default
    const result = await tool.handler?.({ command: 'broken command', execute: true })
    expect(result?.structuredContent).toMatchObject({
      passed: false,
      exitCode: -1,
      details: { indexed: false },
    })
  })

  it('requires explicit execute=true before running a shell command', async () => {
    const tool = (await import('./_session-execute.js')).default
    const result = await tool.handler?.({ command: 'echo nope' })
    expect(mockExecuteSandboxed).not.toHaveBeenCalled()
    expect(result?.structuredContent).toMatchObject({ passed: false, exitCode: -1 })
  })
})
