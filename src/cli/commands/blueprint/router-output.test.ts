import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BlueprintCliError,
  formatBlueprintAudit,
  formatBlueprintSummaries,
  formatTaskLine,
  getBlueprintHelpText,
  handleBlueprintError,
  printBlueprintOutput,
} from './router-output.js'

describe('formatTaskLine', () => {
  it('formats a done task with checked checkbox', () => {
    expect(
      formatTaskLine({ status: 'done', id: 'T1', title: 'foo' } as Parameters<
        typeof formatTaskLine
      >[0]),
    ).toEqual('- [x] T1 foo')
  })

  it('formats a todo task with empty checkbox', () => {
    expect(
      formatTaskLine({ status: 'todo', id: 'T2', title: 'bar' } as Parameters<
        typeof formatTaskLine
      >[0]),
    ).toEqual('- [ ] T2 bar')
  })
})

describe('formatBlueprintSummaries', () => {
  it('keeps plain blueprint output when no roadmaps exist', () => {
    const output = formatBlueprintSummaries([
      {
        name: 'feature-a',
        title: 'Feature A',
        status: 'planned',
        complexity: 'S',
        taskCount: 2,
        progress: 50,
        type: 'blueprint',
      },
    ])

    expect(output).toContain('BLUEPRINT feature-a')
    expect(output).not.toContain('ORPHANS')
  })

  it('renders roadmap rows with nested children and orphan grouping', () => {
    const output = formatBlueprintSummaries([
      {
        name: 'roadmap-2026',
        title: 'Roadmap',
        status: 'in-progress',
        complexity: 'L',
        taskCount: 0,
        progress: 0,
        type: 'parent-roadmap',
      },
      {
        name: 'child-a',
        title: 'Child A',
        status: 'planned',
        complexity: 'S',
        taskCount: 1,
        progress: 0,
        type: 'blueprint',
        parentRoadmap: 'roadmap-2026',
      },
      {
        name: 'orphan-a',
        title: 'Orphan',
        status: 'draft',
        complexity: 'S',
        taskCount: 1,
        progress: 0,
        type: 'blueprint',
        parentRoadmap: 'missing-roadmap',
      },
    ])

    expect(output).toContain(
      'ROADMAP roadmap-2026 status=in-progress complexity=L children=1 done=0 in-progress=0 planned=1 draft=0',
    )
    expect(output).toContain(
      '  CHILD child-a status=planned complexity=S progress=0% tasks=1 parent=roadmap-2026',
    )
    expect(output).toContain('ORPHANS')
    expect(output).toContain(
      '  BLUEPRINT orphan-a status=draft complexity=S progress=0% tasks=1 parent=missing-roadmap',
    )
  })

  it('renders reproducible inventory and anomaly summary counts', () => {
    const output = formatBlueprintSummaries([
      {
        name: 'roadmap-active',
        title: 'Active Roadmap',
        status: 'in-progress',
        complexity: 'L',
        taskCount: 3,
        progress: 33,
        type: 'parent-roadmap',
      },
      {
        name: 'planned-child',
        title: 'Planned Child',
        status: 'planned',
        complexity: 'S',
        taskCount: 2,
        progress: 0,
        type: 'blueprint',
        parentRoadmap: 'roadmap-active',
      },
      {
        name: 'completed-with-tasks',
        title: 'Completed With Tasks',
        status: 'completed',
        complexity: 'M',
        taskCount: 4,
        progress: 100,
        type: 'blueprint',
      },
      {
        name: 'completed-zero-task',
        title: 'Completed Zero Task',
        status: 'completed',
        complexity: 'XS',
        taskCount: 0,
        progress: 0,
        type: 'blueprint',
      },
      {
        name: 'draft-orphan',
        title: 'Draft Orphan',
        status: 'draft',
        complexity: 'S',
        taskCount: 1,
        progress: 0,
        type: 'blueprint',
        parentRoadmap: 'missing-roadmap',
      },
    ])

    expect(output).toContain('SUMMARY total=5')
    expect(output).toContain(
      'BY_STATUS archived=0 completed=2 draft=1 in-progress=1 parked=0 planned=1',
    )
    expect(output).toContain('BY_TYPE blueprint=4 parent-roadmap=1')
    expect(output).toContain('ANOMALIES completed-zero-task=1')
  })
})

describe('formatBlueprintAudit', () => {
  it('returns passed message when no issues', () => {
    expect(formatBlueprintAudit({ ok: true, issues: [] })).toEqual('Blueprint audit passed.')
  })

  it('formats error issues with file', () => {
    const result = formatBlueprintAudit({
      ok: false,
      issues: [{ level: 'error', message: 'bad', file: 'x.md' }],
    })
    expect(result).toContain('[error] x.md: bad')
  })

  it('formats warning issues without file', () => {
    const result = formatBlueprintAudit({
      ok: false,
      issues: [{ level: 'warning', message: 'hmm' }],
    })
    expect(result).toContain('[warning] hmm')
  })
})

describe('handleBlueprintError', () => {
  it('throws BlueprintCliError with message from Error', () => {
    expect(() => handleBlueprintError(new Error('oops'))).toThrow(BlueprintCliError)
    expect(() => handleBlueprintError(new Error('oops'))).toThrow('oops')
  })

  it('throws BlueprintCliError with message from plain string', () => {
    expect(() => handleBlueprintError('plain string')).toThrow(BlueprintCliError)
    expect(() => handleBlueprintError('plain string')).toThrow('plain string')
  })
})

describe('printBlueprintOutput', () => {
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

  afterEach(() => {
    consoleSpy.mockClear()
  })

  it('logs a plain string value directly', () => {
    printBlueprintOutput('hello', false)
    expect(consoleSpy).toHaveBeenCalledWith('hello')
  })

  it('logs JSON when asJson is true', () => {
    printBlueprintOutput({ x: 1 }, true)
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify({ x: 1 }, null, 2))
  })
})

describe('getBlueprintHelpText', () => {
  it('returns a non-empty string', () => {
    const text = getBlueprintHelpText()
    expect(typeof text).toBe('string')
    expect(text.length).toBeGreaterThan(0)
  })
})
