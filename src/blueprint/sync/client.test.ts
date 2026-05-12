/**
 * Tests for BlueprintSyncClient — HTTP client implementing BlueprintPlatformClient.
 *
 * Uses injectable `fetchFn` parameter to avoid global stubbing.
 * All network is mocked; no real HTTP calls are made.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthError, BlueprintSyncClient, SyncDisabledError } from './client.js'
import type { SyncCredentials } from './auth.js'
import type { BlueprintPlatformEvent, BlueprintSnapshot } from './types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CREDS: SyncCredentials = {
  token: 'test-token-123',
  platformUrl: 'https://api.example.com',
  repoId: 'abc123',
}

function makeEvent(overrides: Partial<BlueprintPlatformEvent> = {}): BlueprintPlatformEvent {
  return {
    eventId: 'bbbbbbbb-0000-4000-8000-000000000001',
    repoId: 'abc123',
    occurredAt: '2026-05-12T00:00:00.000Z',
    type: 'blueprint.created',
    payload: {
      type: 'blueprint.created',
      slug: 'test-blueprint',
      title: 'Test Blueprint',
      complexity: 'M',
      status: 'planned',
    },
    ...overrides,
  }
}

function makeFetchOk(body: unknown = {}, status = 200): ReturnType<typeof vi.fn> {
  return vi.fn<() => Promise<Response>>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function makeFetchStatus(status: number): ReturnType<typeof vi.fn> {
  return vi.fn<() => Promise<Response>>().mockResolvedValue(
    new Response('Error', { status }),
  )
}

function makeFetchNetworkError(message = 'ECONNREFUSED'): ReturnType<typeof vi.fn> {
  return vi.fn<() => Promise<Response>>().mockRejectedValue(new Error(message))
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// AK_BLUEPRINT_PLATFORM_DISABLED env management
// ---------------------------------------------------------------------------

function setDisabled(val: '1' | undefined): void {
  if (val === undefined) {
    delete process.env['AK_BLUEPRINT_PLATFORM_DISABLED']
  } else {
    process.env['AK_BLUEPRINT_PLATFORM_DISABLED'] = val
  }
}

describe('BlueprintSyncClient', () => {
  afterEach(() => {
    setDisabled(undefined)
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // pushEvent — happy path
  // -------------------------------------------------------------------------

  describe('pushEvent', () => {
    it('resolves void on 200 response', async () => {
      const fetchFn = makeFetchOk({}, 200)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      await expect(client.pushEvent(makeEvent())).resolves.toStrictEqual(undefined)
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    it('resolves void on 201 response', async () => {
      const fetchFn = makeFetchOk({}, 201)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      await expect(client.pushEvent(makeEvent())).resolves.toStrictEqual(undefined)
    })

    it('resolves void on 409 (idempotent duplicate)', async () => {
      const fetchFn = makeFetchStatus(409)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      await expect(client.pushEvent(makeEvent())).resolves.toStrictEqual(undefined)
    })

    it('sends Authorization header with Bearer token', async () => {
      const fetchFn = makeFetchOk({}, 200)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      await client.pushEvent(makeEvent())

      const [, init] = fetchFn.mock.calls[0] as [string, RequestInit]
      const headers = new Headers(init.headers as HeadersInit)
      expect(headers.get('Authorization')).toStrictEqual('Bearer test-token-123')
    })

    it('sends eventId in request body', async () => {
      const fetchFn = makeFetchOk({}, 200)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)
      const event = makeEvent({ eventId: 'fixed-event-id-00000000-0000-4000-8000-0001' })

      await client.pushEvent(event)

      const [, init] = fetchFn.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(body['eventId']).toStrictEqual('fixed-event-id-00000000-0000-4000-8000-0001')
    })

    it('posts to the correct endpoint', async () => {
      const fetchFn = makeFetchOk({}, 200)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      await client.pushEvent(makeEvent())

      const [url] = fetchFn.mock.calls[0] as [string, RequestInit]
      expect(url).toStrictEqual('https://api.example.com/v1/blueprint-events')
    })

    it('auto-generates a UUID eventId when payload eventId is empty string', async () => {
      const fetchFn = makeFetchOk({}, 200)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)
      const event = makeEvent({ eventId: '' })

      await client.pushEvent(event)

      const [, init] = fetchFn.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(typeof body['eventId']).toStrictEqual('string')
      expect(body['eventId'] as string).toMatch(UUID_RE)
    })
  })

  // -------------------------------------------------------------------------
  // pushEvent — retry on 5xx
  // -------------------------------------------------------------------------

  describe('pushEvent — 5xx retry', () => {
    it('retries on 500 and succeeds on the third attempt', async () => {
      const fetchFn = vi.fn<() => Promise<Response>>()
        .mockResolvedValueOnce(new Response('', { status: 500 }))
        .mockResolvedValueOnce(new Response('', { status: 503 }))
        .mockResolvedValueOnce(new Response('', { status: 200 }))

      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn, { baseDelayMs: 1 })

      await expect(client.pushEvent(makeEvent())).resolves.toStrictEqual(undefined)
      expect(fetchFn).toHaveBeenCalledTimes(3)
    })

    it('throws after 3 failed 5xx attempts', async () => {
      const fetchFn = makeFetchStatus(500)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn, { baseDelayMs: 1 })

      await expect(client.pushEvent(makeEvent())).rejects.toThrow()
      expect(fetchFn).toHaveBeenCalledTimes(3)
    })
  })

  // -------------------------------------------------------------------------
  // pushEvent — network error
  // -------------------------------------------------------------------------

  describe('pushEvent — network error', () => {
    it('throws with clear offline message on ECONNREFUSED', async () => {
      const fetchFn = makeFetchNetworkError('ECONNREFUSED')
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn, { baseDelayMs: 1 })

      await expect(client.pushEvent(makeEvent())).rejects.toThrow(/offline|network|ECONNREFUSED/i)
    })

    it('retries network errors up to 3 times before throwing', async () => {
      const fetchFn = makeFetchNetworkError('ECONNREFUSED')
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn, { baseDelayMs: 1 })

      await expect(client.pushEvent(makeEvent())).rejects.toThrow()
      expect(fetchFn).toHaveBeenCalledTimes(3)
    })
  })

  // -------------------------------------------------------------------------
  // pushEvent — 401 AuthError (no retry)
  // -------------------------------------------------------------------------

  describe('pushEvent — 401', () => {
    it('throws AuthError on 401 without retrying', async () => {
      const fetchFn = makeFetchStatus(401)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      await expect(client.pushEvent(makeEvent())).rejects.toBeInstanceOf(AuthError)
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    it('AuthError message contains useful context', async () => {
      const fetchFn = makeFetchStatus(401)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      const err = await client.pushEvent(makeEvent()).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(AuthError)
      expect((err as AuthError).message).toMatch(/401|unauthorized|auth/i)
    })
  })

  // -------------------------------------------------------------------------
  // pushEvent — 429 (retry with backoff)
  // -------------------------------------------------------------------------

  describe('pushEvent — 429', () => {
    it('retries after 429 and succeeds', async () => {
      const fetchFn = vi.fn<() => Promise<Response>>()
        .mockResolvedValueOnce(new Response('', { status: 429 }))
        .mockResolvedValueOnce(new Response('', { status: 200 }))

      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn, { baseDelayMs: 1 })

      await expect(client.pushEvent(makeEvent())).resolves.toStrictEqual(undefined)
      expect(fetchFn).toHaveBeenCalledTimes(2)
    })
  })

  // -------------------------------------------------------------------------
  // AK_BLUEPRINT_PLATFORM_DISABLED=1
  // -------------------------------------------------------------------------

  describe('disabled mode (AK_BLUEPRINT_PLATFORM_DISABLED=1)', () => {
    beforeEach(() => {
      setDisabled('1')
    })

    it('pushEvent returns undefined immediately without fetching', async () => {
      const fetchFn = makeFetchOk({}, 200)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      await expect(client.pushEvent(makeEvent())).resolves.toStrictEqual(undefined)
      expect(fetchFn).not.toHaveBeenCalled()
    })

    it('getSnapshot returns empty snapshot immediately without fetching', async () => {
      const fetchFn = makeFetchOk({}, 200)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      const snapshot = await client.getSnapshot()

      expect(snapshot.blueprints).toStrictEqual([])
      expect(typeof snapshot.fetchedAt).toStrictEqual('string')
      expect(fetchFn).not.toHaveBeenCalled()
    })

    it('listTemplates returns [] without fetching', async () => {
      const fetchFn = makeFetchOk({}, 200)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      const templates = await client.listTemplates()

      expect(templates).toStrictEqual([])
      expect(fetchFn).not.toHaveBeenCalled()
    })

    it('healthCheck returns { ok: false, latencyMs: 0 } without fetching', async () => {
      const fetchFn = makeFetchOk({}, 200)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      const result = await client.healthCheck()

      expect(result).toStrictEqual({ ok: false, latencyMs: 0 })
      expect(fetchFn).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // getSnapshot
  // -------------------------------------------------------------------------

  describe('getSnapshot', () => {
    it('returns a valid BlueprintSnapshot', async () => {
      const snapshotBody: BlueprintSnapshot = {
        blueprints: [
          {
            slug: 'my-bp',
            title: 'My BP',
            status: 'planned',
            complexity: 'M',
            tasks: [
              { id: 't1', title: 'Task 1', status: 'todo', dependsOn: [] },
            ],
          },
        ],
        fetchedAt: '2026-05-12T00:00:00.000Z',
      }
      const fetchFn = makeFetchOk(snapshotBody, 200)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      const result = await client.getSnapshot()

      expect(result.blueprints).toHaveLength(1)
      expect(result.blueprints[0]?.slug).toStrictEqual('my-bp')
      expect(result.fetchedAt).toStrictEqual('2026-05-12T00:00:00.000Z')
    })

    it('fetches a single blueprint when slug is provided', async () => {
      const snapshotBody: BlueprintSnapshot = {
        blueprints: [
          {
            slug: 'specific-bp',
            title: 'Specific',
            status: 'in-progress',
            complexity: 'S',
            tasks: [],
          },
        ],
        fetchedAt: '2026-05-12T00:00:00.000Z',
      }
      const fetchFn = makeFetchOk(snapshotBody, 200)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      await client.getSnapshot({ slug: 'specific-bp' })

      const [url] = fetchFn.mock.calls[0] as [string]
      expect(url).toContain('specific-bp')
    })
  })

  // -------------------------------------------------------------------------
  // getSnapshot — error cases
  // -------------------------------------------------------------------------

  describe('getSnapshot — error cases', () => {
    it('throws on 404 response', async () => {
      const fetchFn = makeFetchStatus(404)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)
      await expect(client.getSnapshot()).rejects.toThrow()
    })

    it('throws on 5xx response without retrying (uses fetchOnce, not retryFetch)', async () => {
      const fetchFn = makeFetchStatus(503)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)
      await expect(client.getSnapshot()).rejects.toThrow()
      // getSnapshot uses fetchOnce — exactly one attempt, no retry
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    it('throws on network error (ECONNREFUSED)', async () => {
      const fetchFn = makeFetchNetworkError('ECONNREFUSED')
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)
      await expect(client.getSnapshot()).rejects.toThrow(/ECONNREFUSED|offline|network/i)
    })

    it('throws on JSON parse failure', async () => {
      const fetchFn = vi.fn<() => Promise<Response>>().mockResolvedValue(
        new Response('not-json{{{{', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      )
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)
      await expect(client.getSnapshot()).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // healthCheck
  // -------------------------------------------------------------------------

  describe('healthCheck', () => {
    it('returns { ok: true, latencyMs: N } on successful response', async () => {
      const fetchFn = makeFetchOk({ status: 'ok' }, 200)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      const result = await client.healthCheck()

      expect(result.ok).toStrictEqual(true)
      expect(typeof result.latencyMs).toStrictEqual('number')
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    })

    it('returns { ok: false, latencyMs: N } on 5xx response', async () => {
      const fetchFn = makeFetchStatus(503)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      const result = await client.healthCheck()

      expect(result.ok).toStrictEqual(false)
    })

    it('returns { ok: false, latencyMs: 0 } on network error', async () => {
      const fetchFn = makeFetchNetworkError('ECONNREFUSED')
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      const result = await client.healthCheck()

      expect(result.ok).toStrictEqual(false)
    })
  })

  // -------------------------------------------------------------------------
  // listTemplates
  // -------------------------------------------------------------------------

  describe('listTemplates', () => {
    it('returns template entries from JSON response', async () => {
      const templates = [
        { name: 'Basic', slug: 'basic', url: 'https://github.com/...' },
        { name: 'SaaS', slug: 'saas', url: 'https://github.com/...', description: 'SaaS template' },
      ]
      const fetchFn = makeFetchOk(templates, 200)
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      const result = await client.listTemplates()

      expect(result).toHaveLength(2)
      expect(result[0]?.slug).toStrictEqual('basic')
    })

    it('returns [] when template source is unreachable', async () => {
      const fetchFn = makeFetchNetworkError('ECONNREFUSED')
      const client = new BlueprintSyncClient(TEST_CREDS, fetchFn)

      const result = await client.listTemplates()

      expect(result).toStrictEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // SyncDisabledError export
  // -------------------------------------------------------------------------

  it('exports SyncDisabledError class', () => {
    const err = new SyncDisabledError('sync is disabled')
    expect(err).toBeInstanceOf(SyncDisabledError)
    expect(err.name).toStrictEqual('SyncDisabledError')
  })
})
