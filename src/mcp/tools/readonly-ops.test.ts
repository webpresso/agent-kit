import { describe, expect, it, beforeEach, vi } from 'vitest'

const runCommandMock = vi.hoisted(() => vi.fn())

vi.mock('./_shared/run-command.js', async () => {
  const actual = await vi.importActual<typeof import('./_shared/run-command.js')>(
    './_shared/run-command.js',
  )
  return {
    ...actual,
    runCommand: runCommandMock,
  }
})

import benchTool from './bench.js'
import gainTool from './gain.js'
import prStatusTool from './pr-status.js'
import releaseReadinessTool from './release-readiness.js'

const cwd = process.cwd()

function ok(stdout = '', stderr = '') {
  return { stdout, stderr, exitCode: 0, signal: null, timedOut: false, aborted: false }
}

function fail(stdout = '', stderr = '', exitCode = 1) {
  return { stdout, stderr, exitCode, signal: null, timedOut: false, aborted: false }
}

function missingBinary(command: string) {
  const error = new Error(`spawn ${command} ENOENT`) as NodeJS.ErrnoException
  error.code = 'ENOENT'
  return { error }
}

beforeEach(() => {
  runCommandMock.mockReset()
})

describe('read-only ops MCP tools', () => {
  it('wp_pr_status reads PR metadata and checks through gh without mutation', async () => {
    runCommandMock
      .mockResolvedValueOnce(ok(JSON.stringify({ number: 182, title: 'ops', state: 'OPEN' })))
      .mockResolvedValueOnce(ok('[{"name":"CI","state":"SUCCESS"}]'))

    const result = await prStatusTool.handler({ cwd, branch: 'feat/x' })
    const payload = result.structuredContent as {
      passed: boolean
      summary: string
      counts: { commandCount: number; passedCount: number; failedCount: number }
      details: { pr: { number: number }; commands: Array<{ command: { command: string; args: string[] } }> }
    }

    expect(prStatusTool.annotations?.readOnlyHint).toBe(true)
    expect(runCommandMock).toHaveBeenCalledTimes(2)
    expect(runCommandMock.mock.calls[0]?.[0]).toBe('gh')
    expect(runCommandMock.mock.calls[0]?.[1]).toEqual([
      'pr',
      'view',
      'feat/x',
      '--json',
      'number,title,state,url,baseRefName,headRefName,isDraft,mergeable,reviewDecision,statusCheckRollup,reviews',
    ])
    expect(runCommandMock.mock.calls[1]?.[1]).toEqual([
      'pr',
      'checks',
      'feat/x',
      '--json',
      'name,state,bucket,link,description',
    ])
    expect(payload.passed).toBe(true)
    expect(payload.summary).toBe('pr status read for #182')
    expect(payload.counts).toEqual({ commandCount: 2, passedCount: 2, failedCount: 0 })
    expect(payload.details.pr.number).toBe(182)
  })

  it('wp_pr_status degrades when gh is missing', async () => {
    runCommandMock.mockResolvedValueOnce(missingBinary('gh')).mockResolvedValueOnce(missingBinary('gh'))

    const result = await prStatusTool.handler({ cwd })
    const payload = result.structuredContent as { passed: boolean; warnings: string[] }

    expect(payload.passed).toBe(false)
    expect(payload.warnings).toEqual(['missing binary: gh', 'missing binary: gh'])
  })

  it('wp_bench defaults session-memory to dry-run', async () => {
    runCommandMock.mockResolvedValueOnce(ok(JSON.stringify({ exitCode: 0, dryRun: true, cellCount: 3 })))

    const result = await benchTool.handler({ cwd, scenario: 'debug-long-session' })
    const payload = result.structuredContent as {
      passed: boolean
      summary: string
      details: { mode: string; command: { args: string[] } }
    }

    expect(runCommandMock).toHaveBeenCalledOnce()
    expect(runCommandMock.mock.calls[0]?.[0]).toBe('./bin/wp')
    expect(runCommandMock.mock.calls[0]?.[1]).toEqual([
      'bench',
      'session-memory',
      '--dry-run',
      '--scenario',
      'debug-long-session',
    ])
    expect(payload).toMatchObject({ passed: true, summary: 'bench session-memory dry-run passed' })
    expect(payload.details.mode).toBe('dry-run')
  })

  it('wp_bench requires explicit live mode before omitting --dry-run', async () => {
    runCommandMock.mockResolvedValueOnce(ok(JSON.stringify({ exitCode: 0, dryRun: false })))

    await benchTool.handler({ cwd, mode: 'live', variant: 'v2', trials: 1 })

    expect(runCommandMock.mock.calls[0]?.[1]).toEqual([
      'bench',
      'session-memory',
      '--variant',
      'v2',
      '--trials',
      '1',
    ])
  })

  it('wp_gain reads Webpresso session-memory gain through ./bin/wp', async () => {
    runCommandMock.mockResolvedValueOnce(ok('Exact UTF-8 gain bytes: 1200'))

    const result = await gainTool.handler({ cwd })
    const payload = result.structuredContent as {
      passed: boolean
      summary: string
      rawOutput: string
      details: { source: string; command: { command: string; args: string[] } }
    }

    expect(runCommandMock.mock.calls[0]?.[0]).toBe('./bin/wp')
    expect(runCommandMock.mock.calls[0]?.[1]).toEqual(['gain'])
    expect(payload.summary).toBe('session-memory gain read successfully')
    expect(payload.details.source).toBe('session-memory')
    expect(payload.rawOutput).toContain('Exact UTF-8 gain bytes: 1200')
  })

  it('wp_gain can read RTK gain JSON and degrade if rtk is absent', async () => {
    runCommandMock.mockResolvedValueOnce(missingBinary('rtk'))

    const result = await gainTool.handler({ cwd, source: 'rtk', format: 'json' })
    const payload = result.structuredContent as { passed: boolean; warnings: string[] }

    expect(runCommandMock.mock.calls[0]?.[0]).toBe('rtk')
    expect(runCommandMock.mock.calls[0]?.[1]).toEqual(['gain', '--format', 'json'])
    expect(payload.passed).toBe(false)
    expect(payload.warnings).toEqual(['missing binary: rtk'])
  })

  it('wp_release_readiness aggregates only read-only release checks', async () => {
    runCommandMock
      .mockResolvedValueOnce(ok('package surface ok'))
      .mockResolvedValueOnce(ok('reference parity ok'))
      .mockResolvedValueOnce(ok('changeset status ok'))

    const result = await releaseReadinessTool.handler({ cwd })
    const payload = result.structuredContent as {
      passed: boolean
      summary: string
      counts: { commandCount: number; passedCount: number; failedCount: number }
      details: { commands: Array<{ command: { command: string; args: string[] } }> }
    }

    expect(releaseReadinessTool.annotations?.readOnlyHint).toBe(true)
    expect(runCommandMock.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['./bin/wp', ['audit', 'package-surface']],
      ['./bin/wp', ['audit', 'reference-parity-matrix', '--strict']],
      ['vp', ['run', 'changeset:status']],
    ])
    expect(payload.passed).toBe(true)
    expect(payload.summary).toBe('release readiness passed (3 checks)')
    expect(payload.counts).toEqual({ commandCount: 3, passedCount: 3, failedCount: 0 })
  })

  it('wp_release_readiness refuses public readiness rather than advertising it as read-only', async () => {
    const result = await releaseReadinessTool.handler({ cwd, includePublicReadiness: true })
    const payload = result.structuredContent as { passed: boolean; warnings: string[] }

    expect(result.isError).toBe(true)
    expect(payload.passed).toBe(false)
    expect(payload.warnings).toEqual(['public_readiness_not_read_only'])
    expect(runCommandMock).not.toHaveBeenCalled()
  })

  it('wp_release_readiness returns a failed aggregate without throwing', async () => {
    runCommandMock
      .mockResolvedValueOnce(ok('package surface ok'))
      .mockResolvedValueOnce(fail('', 'reference parity failed', 1))

    const result = await releaseReadinessTool.handler({
      cwd,
      includeChangesetStatus: false,
      includePublicReadiness: false,
    })
    const payload = result.structuredContent as { passed: boolean; summary: string; counts: Record<string, number> }

    expect(payload.passed).toBe(false)
    expect(payload.summary).toBe('release readiness failed (1/2 checks failed)')
    expect(payload.counts).toEqual({ commandCount: 2, passedCount: 1, failedCount: 1 })
  })

  it('bounds raw output for all command-backed tools', async () => {
    runCommandMock.mockResolvedValueOnce(ok('bounded output line. '.repeat(300)))

    const result = await gainTool.handler({ cwd, maxOutputBytes: 32 })
    const payload = result.structuredContent as { rawOutput: string; truncated: true }

    expect(payload.rawOutput).toHaveLength(32)
    expect(payload.truncated).toBe(true)
  })

  it('redacts and bounds parsed JSON details independently of raw output clipping', async () => {
    runCommandMock
      .mockResolvedValueOnce(
        ok(
          JSON.stringify({
            ok: true,
            token: 'ghp_abcdefghijklmnopqrstuvwxyz1234567890',
            huge: 'safe chunk '.repeat(400),
          }),
        ),
      )
      .mockResolvedValueOnce(ok('[]'))

    const result = await prStatusTool.handler({ cwd, branch: 'feat/x', maxOutputBytes: 80 })
    const payload = result.structuredContent as {
      details: { pr: { truncated: true; snippet: string } }
    }

    expect(payload.details.pr.truncated).toBe(true)
    expect(payload.details.pr.snippet).toHaveLength(80)
    expect(payload.details.pr.snippet).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz1234567890')
  })
})
