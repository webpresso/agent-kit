/**
 * Tests for the auto-update orchestrator.
 *
 * - `update-notifier` is mocked wholesale — it is not installed in this repo
 *   yet and the orchestrator's behaviour is fully unit-testable without a real
 *   registry probe.
 * - `detect-pm`, `installer`, `log`, and `skip` dependencies are mocked so
 *   each test exercises one decision branch in isolation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Module mocks (must be declared before any imports) ───────────────────────

vi.mock('update-notifier', () => ({
  default: vi.fn(),
}))

vi.mock('./detect-pm.js', () => ({
  detect: vi.fn(),
}))

vi.mock('./installer.js', () => ({
  scheduleDeferredInstall: vi.fn(),
}))

vi.mock('./log.js', () => ({
  logUpdateError: vi.fn(),
}))

vi.mock('./skip.js', () => ({
  shouldSkipAutoInstall: vi.fn(),
}))

// ─── Imports (after vi.mock hoisting) ─────────────────────────────────────────

import updateNotifier from 'update-notifier'

import { detect } from './detect-pm.js'
import { scheduleDeferredInstall } from './installer.js'
import { logUpdateError } from './log.js'
import { runUpdateFlow } from './run.js'
import { shouldSkipAutoInstall } from './skip.js'

// ─── Typed mocks ──────────────────────────────────────────────────────────────

const updateNotifierMock = vi.mocked(updateNotifier)
const detectMock = vi.mocked(detect)
const scheduleDeferredInstallMock = vi.mocked(scheduleDeferredInstall)
const logUpdateErrorMock = vi.mocked(logUpdateError)
const shouldSkipAutoInstallMock = vi.mocked(shouldSkipAutoInstall)

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface NotifierStub {
  fetchInfo: ReturnType<typeof vi.fn>
  notify: ReturnType<typeof vi.fn>
}

function makeNotifierStub(fetchInfoResult: unknown): NotifierStub {
  return {
    fetchInfo: vi.fn().mockResolvedValue(fetchInfoResult),
    notify: vi.fn(),
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  updateNotifierMock.mockReset()
  detectMock.mockReset()
  scheduleDeferredInstallMock.mockReset()
  logUpdateErrorMock.mockReset()
  shouldSkipAutoInstallMock.mockReset()
  shouldSkipAutoInstallMock.mockReturnValue(false)
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runUpdateFlow — no update available', () => {
  it('is a no-op when fetchInfo returns null', async () => {
    const stub = makeNotifierStub(null)
    updateNotifierMock.mockReturnValue(stub as never)

    await runUpdateFlow('1.0.0')

    expect(stub.notify).not.toHaveBeenCalled()
    expect(scheduleDeferredInstallMock).not.toHaveBeenCalled()
    expect(logUpdateErrorMock).not.toHaveBeenCalled()
  })

  it('is a no-op when update.type is "latest"', async () => {
    const stub = makeNotifierStub({ type: 'latest', latest: '1.0.0', current: '1.0.0' })
    updateNotifierMock.mockReturnValue(stub as never)

    await runUpdateFlow('1.0.0')

    expect(stub.notify).not.toHaveBeenCalled()
    expect(scheduleDeferredInstallMock).not.toHaveBeenCalled()
    expect(logUpdateErrorMock).not.toHaveBeenCalled()
  })

  it('passes the correct pkg name and version to updateNotifier', async () => {
    const stub = makeNotifierStub(null)
    updateNotifierMock.mockReturnValue(stub as never)

    await runUpdateFlow('2.3.4')

    expect(updateNotifierMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pkg: { name: 'webpresso', version: '2.3.4' },
      }),
    )
  })
})

describe('runUpdateFlow — update available + AK_SKIP_AUTO_INSTALL=1', () => {
  it('calls notify but does not call scheduleDeferredInstall', async () => {
    const stub = makeNotifierStub({ type: 'minor', latest: '2.0.0', current: '1.0.0' })
    updateNotifierMock.mockReturnValue(stub as never)
    shouldSkipAutoInstallMock.mockReturnValue(true)

    await runUpdateFlow('1.0.0')

    expect(stub.notify).toHaveBeenCalledOnce()
    expect(stub.notify).toHaveBeenCalledWith({ defer: true, isGlobal: true })
    expect(scheduleDeferredInstallMock).not.toHaveBeenCalled()
    expect(logUpdateErrorMock).not.toHaveBeenCalled()
  })
})

describe('runUpdateFlow — update available + PM detected', () => {
  it('calls scheduleDeferredInstall with the detected command', async () => {
    const stub = makeNotifierStub({ type: 'minor', latest: '2.0.0', current: '1.0.0' })
    updateNotifierMock.mockReturnValue(stub as never)
    shouldSkipAutoInstallMock.mockReturnValue(false)
    detectMock.mockReturnValue({ manager: 'npm', command: ['npm', 'install', '-g', 'webpresso'] })

    await runUpdateFlow('1.0.0')

    expect(stub.notify).toHaveBeenCalledOnce()
    expect(scheduleDeferredInstallMock).toHaveBeenCalledOnce()
    expect(scheduleDeferredInstallMock).toHaveBeenCalledWith({
      command: ['npm', 'install', '-g', 'webpresso'],
    })
    expect(logUpdateErrorMock).not.toHaveBeenCalled()
  })
})

describe('runUpdateFlow — update available + PM abort', () => {
  it('calls logUpdateError with the abort reason, does not spawn', async () => {
    const stub = makeNotifierStub({ type: 'patch', latest: '1.0.1', current: '1.0.0' })
    updateNotifierMock.mockReturnValue(stub as never)
    shouldSkipAutoInstallMock.mockReturnValue(false)
    detectMock.mockReturnValue({ abort: 'Unable to detect a package manager' })

    await runUpdateFlow('1.0.0')

    expect(stub.notify).toHaveBeenCalledOnce()
    expect(scheduleDeferredInstallMock).not.toHaveBeenCalled()
    expect(logUpdateErrorMock).toHaveBeenCalledOnce()
    const errArg = logUpdateErrorMock.mock.calls[0]?.[0]
    expect(errArg).toBeInstanceOf(Error)
    expect((errArg as Error).message).toContain('Unable to detect a package manager')
  })
})

describe('runUpdateFlow — fetchInfo throws', () => {
  it('swallows the error via logUpdateError and resolves', async () => {
    const fetchError = new Error('registry timeout')
    const stub = {
      fetchInfo: vi.fn().mockRejectedValue(fetchError),
      notify: vi.fn(),
    }
    updateNotifierMock.mockReturnValue(stub as never)

    await expect(runUpdateFlow('1.0.0')).resolves.toBeUndefined()

    expect(logUpdateErrorMock).toHaveBeenCalledOnce()
    expect(logUpdateErrorMock).toHaveBeenCalledWith(fetchError)
    expect(stub.notify).not.toHaveBeenCalled()
    expect(scheduleDeferredInstallMock).not.toHaveBeenCalled()
  })

  it('resolves (does not reject) even when the whole notifier construction throws', async () => {
    updateNotifierMock.mockImplementation(() => {
      throw new Error('internal notifier error')
    })

    await expect(runUpdateFlow('1.0.0')).resolves.toBeUndefined()

    expect(logUpdateErrorMock).toHaveBeenCalledOnce()
  })
})
