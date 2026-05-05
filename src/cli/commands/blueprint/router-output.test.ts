import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BlueprintCliError,
  formatBlueprintAudit,
  formatTaskLine,
  getBlueprintHelpText,
  handleBlueprintError,
  printBlueprintOutput,
} from './router-output.js'

describe('formatTaskLine', () => {
  it('formats a done task with checked checkbox', () => {
    expect(formatTaskLine({ status: 'done', id: 'T1', title: 'foo' } as Parameters<typeof formatTaskLine>[0])).toEqual('- [x] T1 foo')
  })

  it('formats a todo task with empty checkbox', () => {
    expect(formatTaskLine({ status: 'todo', id: 'T2', title: 'bar' } as Parameters<typeof formatTaskLine>[0])).toEqual('- [ ] T2 bar')
  })
})

describe('formatBlueprintAudit', () => {
  it('returns passed message when no issues', () => {
    expect(formatBlueprintAudit({ issues: [] })).toEqual('Blueprint audit passed.')
  })

  it('formats error issues with file', () => {
    const result = formatBlueprintAudit({
      issues: [{ level: 'error', message: 'bad', file: 'x.md' }],
    })
    expect(result).toContain('[error] x.md: bad')
  })

  it('formats warn issues without file', () => {
    const result = formatBlueprintAudit({
      issues: [{ level: 'warn', message: 'hmm' }],
    })
    expect(result).toContain('[warn] hmm')
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
