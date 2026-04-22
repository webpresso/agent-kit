import { describe, expect, it } from 'vitest'

import { formatUnknownCommandError, normalizeArgv } from './utils.js'

describe('normalizeArgv', () => {
  it('strips a leading "--" separator at argv[2]', () => {
    const argv = ['node', 'cli.js', '--', 'blueprint', 'list']
    expect(normalizeArgv(argv)).toEqual(['node', 'cli.js', 'blueprint', 'list'])
  })

  it('leaves argv unchanged when no separator', () => {
    const argv = ['node', 'cli.js', 'blueprint', 'list']
    expect(normalizeArgv(argv)).toEqual(argv)
  })

  it('preserves "--" that appears later in argv', () => {
    const argv = ['node', 'cli.js', 'blueprint', '--', 'extra']
    expect(normalizeArgv(argv)).toEqual(argv)
  })
})

describe('formatUnknownCommandError', () => {
  const COMMANDS = ['blueprint', 'symlink', 'audit', 'skills', 'docs'] as const

  it('suggests a single close match when one is found', () => {
    const message = formatUnknownCommandError('blueprintz', COMMANDS)
    expect(message).toContain('Unknown command: blueprintz')
    expect(message).toContain('Did you mean: ak blueprint?')
    expect(message).toContain('Run ak --help')
  })

  it('returns a no-suggestions message when nothing is close', () => {
    const message = formatUnknownCommandError('xyzqqq', COMMANDS)
    expect(message).toContain('Unknown command: xyzqqq')
    expect(message).not.toContain('Did you mean')
    expect(message).toContain('Run ak --help')
  })

  it('honours a custom bin name', () => {
    const message = formatUnknownCommandError('symlnk', ['symlink'], 'wp')
    expect(message).toContain('Did you mean: wp symlink?')
  })
})
