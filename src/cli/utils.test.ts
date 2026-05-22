import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  findProjectRoot,
  formatUnknownCommandError,
  normalizeArgv,
  PROJECT_ROOT_MARKERS,
} from './utils.js'

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
    expect(message).toContain('Did you mean: wp blueprint?')
    expect(message).toContain('Run wp --help')
  })

  it('returns a no-suggestions message when nothing is close', () => {
    const message = formatUnknownCommandError('xyzqqq', COMMANDS)
    expect(message).toContain('Unknown command: xyzqqq')
    expect(message).not.toContain('Did you mean')
    expect(message).toContain('Run wp --help')
  })

  it('honours a custom bin name', () => {
    const message = formatUnknownCommandError('symlnk', ['symlink'], 'wp')
    expect(message).toContain('Did you mean: wp symlink?')
  })
})

describe('findProjectRoot', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  async function tempRoot(prefix: string): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), prefix))
    tempDirs.push(root)
    return root
  }

  it('checks generic consumer markers before the Webpresso legacy sentinel', () => {
    expect(PROJECT_ROOT_MARKERS.slice(0, 3)).toEqual([
      '.agent-kitrc.json',
      'pnpm-workspace.yaml',
      'package.json',
    ])
    expect(PROJECT_ROOT_MARKERS.at(-1)).toBe('webpresso/config.yaml')
  })

  it('finds a generic package.json project root from a nested directory', async () => {
    const root = await tempRoot('wp-root-package-')
    writeFileSync(path.join(root, 'package.json'), '{"name":"consumer"}')
    const nested = path.join(root, 'packages', 'tool', 'src')
    mkdirSync(nested, { recursive: true })

    expect(findProjectRoot(nested)).toBe(root)
  })

  it('keeps webpresso/config.yaml as a fallback root marker', async () => {
    const root = await tempRoot('wp-root-webpresso-')
    mkdirSync(path.join(root, 'webpresso'), { recursive: true })
    writeFileSync(path.join(root, 'webpresso', 'config.yaml'), 'project:\n  name: webpresso\n')
    const nested = path.join(root, 'webpresso', 'blueprints')
    mkdirSync(nested, { recursive: true })

    expect(findProjectRoot(nested)).toBe(root)
  })
})
