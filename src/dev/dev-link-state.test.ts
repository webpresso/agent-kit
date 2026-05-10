import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { STATE_FILE_RELATIVE_PATH, readDevLinkState } from './dev-link-state'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dev-link-state-'))
  tempRoots.push(root)
  return root
}

function writeState(consumer: string, payload: unknown): string {
  const path = join(consumer, STATE_FILE_RELATIVE_PATH)
  mkdirSync(join(consumer, '.webpresso'), { recursive: true })
  writeFileSync(path, JSON.stringify(payload), 'utf8')
  return path
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('readDevLinkState', () => {
  it('returns null when the file is absent (CI / never linked)', () => {
    expect(readDevLinkState(createTempRoot())).toBeNull()
  })

  it('parses a complete state file', () => {
    const consumer = createTempRoot()
    writeState(consumer, {
      package: '@webpresso/agent-kit',
      linkedFrom: '/abs/path/to/agent-kit',
      linkedAt: '2026-05-10T18:34:45.281Z',
      agentKitVersion: '0.9.0',
      note: 'whatever',
    })

    expect(readDevLinkState(consumer)).toEqual({
      package: '@webpresso/agent-kit',
      linkedFrom: '/abs/path/to/agent-kit',
      linkedAt: '2026-05-10T18:34:45.281Z',
      agentKitVersion: '0.9.0',
      note: 'whatever',
    })
  })

  it('parses minimal valid state (only required fields)', () => {
    const consumer = createTempRoot()
    writeState(consumer, { package: 'pkg', linkedFrom: '/x' })
    expect(readDevLinkState(consumer)).toEqual({
      package: 'pkg',
      linkedFrom: '/x',
      linkedAt: undefined,
      agentKitVersion: undefined,
      note: undefined,
    })
  })

  it('returns null when file is unreadable JSON (degrade gracefully)', () => {
    const consumer = createTempRoot()
    mkdirSync(join(consumer, '.webpresso'), { recursive: true })
    writeFileSync(join(consumer, STATE_FILE_RELATIVE_PATH), '{ not json', 'utf8')

    expect(readDevLinkState(consumer)).toBeNull()
  })

  it('returns null when required fields are missing', () => {
    const consumer = createTempRoot()
    writeState(consumer, { linkedFrom: '/x' })
    expect(readDevLinkState(consumer)).toBeNull()
  })

  it('returns null when package field is empty string', () => {
    const consumer = createTempRoot()
    writeState(consumer, { package: '', linkedFrom: '/x' })
    expect(readDevLinkState(consumer)).toBeNull()
  })

  it('returns null when linkedFrom field is empty string', () => {
    const consumer = createTempRoot()
    writeState(consumer, { package: 'pkg', linkedFrom: '' })
    expect(readDevLinkState(consumer)).toBeNull()
  })

  it('returns null when payload is not an object', () => {
    const consumer = createTempRoot()
    mkdirSync(join(consumer, '.webpresso'), { recursive: true })
    writeFileSync(join(consumer, STATE_FILE_RELATIVE_PATH), '"a string"', 'utf8')

    expect(readDevLinkState(consumer)).toBeNull()
  })

  it('strips unexpected types on optional fields rather than rejecting', () => {
    const consumer = createTempRoot()
    writeState(consumer, {
      package: 'pkg',
      linkedFrom: '/x',
      linkedAt: 12345,
      agentKitVersion: false,
      note: { not: 'a string' },
    })

    expect(readDevLinkState(consumer)).toEqual({
      package: 'pkg',
      linkedFrom: '/x',
      linkedAt: undefined,
      agentKitVersion: undefined,
      note: undefined,
    })
  })
})
