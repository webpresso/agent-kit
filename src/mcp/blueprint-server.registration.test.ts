import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkFreshness: vi.fn(),
  coldStartIfNeeded: vi.fn(),
  ingestAll: vi.fn(),
  openDb: vi.fn(),
  recordProjectionMetadata: vi.fn(),
}))

vi.mock('#db/cold-start.js', () => ({
  coldStartIfNeeded: mocks.coldStartIfNeeded,
}))

vi.mock('#db/connection.js', () => ({
  openDb: mocks.openDb,
}))

vi.mock('#db/ingester.js', () => ({
  ingestAll: mocks.ingestAll,
}))

vi.mock('#freshness.js', () => ({
  checkFreshness: mocks.checkFreshness,
  readCurrentHead: vi.fn(() => null),
  readProjectionMetadata: vi.fn(() => null),
  recordProjectionMetadata: mocks.recordProjectionMetadata,
}))

import { registerBlueprintTools } from './blueprint-server.js'

function makeRegistrar() {
  const registerTool = vi.fn()
  return {
    registerTool,
    registeredToolNames: () =>
      registerTool.mock.calls.map((call) => call[0] as string).sort((a, b) => a.localeCompare(b)),
  }
}

describe('registerBlueprintTools bootstrap', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'ak-bs-registration-'))
    mkdirSync(path.join(cwd, '.agent'), { recursive: true })
    writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'test-repo' }), 'utf8')

    mocks.coldStartIfNeeded.mockReset()
    mocks.checkFreshness.mockReset()
    mocks.ingestAll.mockReset()
    mocks.openDb.mockReset()
    mocks.recordProjectionMetadata.mockReset()

    mocks.coldStartIfNeeded.mockResolvedValue({
      rebuilt: false,
      blueprintsCount: 0,
      techDebtCount: 0,
      durationMs: 0,
    })
    mocks.checkFreshness.mockReturnValue({
      ok: true,
      head: null,
      ingestedAt: 1_700_000_000_000,
    })
    mocks.ingestAll.mockResolvedValue({
      blueprintsIngested: 0,
      techDebtIngested: 0,
    })
    mocks.openDb.mockReturnValue({
      db: {},
      close: vi.fn(),
    })
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('does not re-ingest during registration when the existing projection is already fresh', async () => {
    const registrar = makeRegistrar()

    await registerBlueprintTools(registrar, cwd)

    expect(mocks.coldStartIfNeeded).toHaveBeenCalledWith(cwd)
    expect(mocks.checkFreshness).toHaveBeenCalledTimes(1)
    expect(mocks.ingestAll).not.toHaveBeenCalled()
    expect(registrar.registeredToolNames()).toContain('wp_blueprint_validate')
  })

  it('re-ingests during registration when the existing projection is stale', async () => {
    const registrar = makeRegistrar()
    mocks.checkFreshness.mockReturnValue({
      ok: false,
      next_action: { type: 'reingest_project', reason: 'HEAD changed' },
    })

    await registerBlueprintTools(registrar, cwd)

    expect(mocks.ingestAll).toHaveBeenCalledTimes(1)
    expect(mocks.recordProjectionMetadata).toHaveBeenCalledTimes(1)
  })
})
