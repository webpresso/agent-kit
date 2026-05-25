import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { restoreDevLinks } from './index'
import { STATE_FILE_RELATIVE_PATH } from '#dev/dev-link-state'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'restore-dev-links-'))
  tempRoots.push(root)
  return root
}

function createSourceRepo(): string {
  const source = createTempRoot()
  writeFileSync(
    join(source, 'package.json'),
    JSON.stringify({ name: 'webpresso', version: '0.0.0-test' }),
    'utf8',
  )
  return source
}

function writeStateFile(consumer: string, payload: unknown): void {
  mkdirSync(join(consumer, '.webpresso'), { recursive: true })
  writeFileSync(join(consumer, STATE_FILE_RELATIVE_PATH), JSON.stringify(payload), 'utf8')
}

function captureStdout(): {
  stdout: { write: (chunk: string) => boolean }
  output: string[]
} {
  const output: string[] = []
  return {
    output,
    stdout: {
      write: (chunk: string) => {
        output.push(chunk)
        return true
      },
    },
  }
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('restoreDevLinks', () => {
  it('exits 0 silently when state file is absent (CI path)', () => {
    const { stdout, output } = captureStdout()
    const result = restoreDevLinks({ cwd: createTempRoot(), stdout })

    expect(result.exitCode).toBe(0)
    expect(result.outcomes[0]?.kind).toBe('no-state-file')
    expect(output.join('')).toBe('')
  })

  it('creates the symlink when state file is present and source exists', () => {
    const consumer = createTempRoot()
    const source = createSourceRepo()
    writeStateFile(consumer, { package: 'webpresso', linkedFrom: source })
    const { stdout, output } = captureStdout()

    const result = restoreDevLinks({ cwd: consumer, stdout })

    expect(result.exitCode).toBe(0)
    expect(result.outcomes[0]?.kind).toBe('relinked')
    const target = join(consumer, 'node_modules', 'webpresso')
    expect(lstatSync(target).isSymbolicLink()).toBe(true)
    expect(readlinkSync(target)).toBe(source)
    expect(output.join('')).toContain('webpresso → ')
  })

  it('replaces a stale symlink that points elsewhere', () => {
    const consumer = createTempRoot()
    const source = createSourceRepo()
    const stalePnpmStore = createTempRoot()
    const target = join(consumer, 'node_modules', 'webpresso')
    mkdirSync(join(consumer, 'node_modules', '@webpresso'), { recursive: true })
    symlinkSync(stalePnpmStore, target, 'dir')
    writeStateFile(consumer, { package: 'webpresso', linkedFrom: source })
    const { stdout } = captureStdout()

    const result = restoreDevLinks({ cwd: consumer, stdout })

    expect(result.exitCode).toBe(0)
    expect(result.outcomes[0]).toMatchObject({
      kind: 'relinked',
      previous: stalePnpmStore,
    })
    expect(readlinkSync(target)).toBe(source)
  })

  it('reports already-linked when the symlink target already matches', () => {
    const consumer = createTempRoot()
    const source = createSourceRepo()
    const target = join(consumer, 'node_modules', 'webpresso')
    mkdirSync(join(consumer, 'node_modules', '@webpresso'), { recursive: true })
    symlinkSync(source, target, 'dir')
    writeStateFile(consumer, { package: 'webpresso', linkedFrom: source })
    const { stdout, output } = captureStdout()

    const result = restoreDevLinks({ cwd: consumer, stdout })

    expect(result.exitCode).toBe(0)
    expect(result.outcomes[0]?.kind).toBe('already-linked')
    expect(output.join('')).toContain('already linked')
  })

  it('backs up a real directory left at the symlink path before linking', () => {
    const consumer = createTempRoot()
    const source = createSourceRepo()
    const target = join(consumer, 'node_modules', 'webpresso')
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'marker.txt'), 'pnpm-store-snapshot', 'utf8')
    writeStateFile(consumer, { package: 'webpresso', linkedFrom: source })
    const { stdout } = captureStdout()

    const result = restoreDevLinks({ cwd: consumer, stdout })

    expect(result.exitCode).toBe(0)
    expect(result.outcomes[0]).toMatchObject({
      kind: 'relinked',
      previous: expect.stringMatching(/\.store-snapshot\./),
    })
    expect(lstatSync(target).isSymbolicLink()).toBe(true)
    expect(readlinkSync(target)).toBe(source)
  })

  it('exits 1 loudly when state file points at a missing source', () => {
    const consumer = createTempRoot()
    const missingSource = join(consumer, 'definitely-does-not-exist')
    writeStateFile(consumer, { package: 'webpresso', linkedFrom: missingSource })
    const errors: string[] = []
    const { stdout } = captureStdout()

    const result = restoreDevLinks({
      cwd: consumer,
      stdout,
      stderr: {
        write: (chunk: string) => {
          errors.push(chunk)
          return true
        },
      },
    })

    expect(result.exitCode).toBe(1)
    expect(result.outcomes[0]?.kind).toBe('source-missing')
    const message = errors.join('')
    expect(message).toContain(missingSource)
    expect(message).toContain(STATE_FILE_RELATIVE_PATH)
  })

  it('exits 0 silently when state file is malformed (degrades to no-state-file)', () => {
    const consumer = createTempRoot()
    mkdirSync(join(consumer, '.webpresso'), { recursive: true })
    writeFileSync(join(consumer, STATE_FILE_RELATIVE_PATH), '{ not json', 'utf8')
    const { stdout } = captureStdout()

    const result = restoreDevLinks({ cwd: consumer, stdout })

    expect(result.exitCode).toBe(0)
    expect(result.outcomes[0]?.kind).toBe('no-state-file')
  })
})
