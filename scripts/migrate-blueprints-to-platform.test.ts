/**
 * Tests for migrate-blueprints-to-platform.ts
 *
 * Strategy: pure unit tests with a mocked `fetchFn`.
 * No subprocesses, no disk I/O beyond fixture blueprints written in temp dirs.
 * Uses injectable `fetchFn` — no `vi.stubGlobal`, matching the pattern in client.test.ts.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildEvent,
  deriveEventId,
  discoverBlueprints,
  migrate,
  parseFrontmatter,
  slugFromPath,
} from './migrate-blueprints-to-platform.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchOk(status = 200): ReturnType<typeof vi.fn> {
  return vi.fn<() => Promise<Response>>().mockResolvedValue(
    new Response('{}', {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

function createBlueprintFixture(
  root: string,
  dir: string,
  slug: string,
  frontmatter: string,
): string {
  const blueprintDir = join(root, 'blueprints', dir, slug)
  mkdirSync(blueprintDir, { recursive: true })
  const overviewPath = join(blueprintDir, '_overview.md')
  writeFileSync(overviewPath, `---\n${frontmatter}\n---\n\n# Title\n`)
  return overviewPath
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_FRONTMATTER = `type: blueprint
title: Test Blueprint Alpha
status: planned
complexity: M
created: '2026-01-01'`

const VALID_FRONTMATTER_B = `type: blueprint
title: Another Blueprint Beta
status: completed
complexity: S
created: '2026-02-01'`

const FRONTMATTER_MISSING_STATUS = `type: blueprint
title: No Status Blueprint
complexity: L`

const FRONTMATTER_MISSING_COMPLEXITY = `type: blueprint
title: No Complexity
status: in-progress`

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe('parseFrontmatter', () => {
  it('parses valid frontmatter with all required fields', () => {
    const content = `---\n${VALID_FRONTMATTER}\n---\n\n# Body`
    const result = parseFrontmatter(content)
    expect(result).toStrictEqual({
      title: 'Test Blueprint Alpha',
      status: 'planned',
      complexity: 'M',
    })
  })

  it('returns null when frontmatter block is absent', () => {
    expect(parseFrontmatter('# Just a heading\nNo frontmatter here')).toStrictEqual(null)
  })

  it('returns null when status is missing', () => {
    const content = `---\n${FRONTMATTER_MISSING_STATUS}\n---\n`
    expect(parseFrontmatter(content)).toStrictEqual(null)
  })

  it('returns null when complexity is missing', () => {
    const content = `---\n${FRONTMATTER_MISSING_COMPLEXITY}\n---\n`
    expect(parseFrontmatter(content)).toStrictEqual(null)
  })

  it('handles empty title gracefully (title field is optional)', () => {
    const content = `---\nstatus: planned\ncomplexity: XS\n---\n`
    const result = parseFrontmatter(content)
    expect(result).toStrictEqual({ title: '', status: 'planned', complexity: 'XS' })
  })

  it('strips single quotes from values', () => {
    const content = `---\ntitle: 'Quoted Title'\nstatus: planned\ncomplexity: L\n---\n`
    const result = parseFrontmatter(content)
    expect(result?.title).toStrictEqual('Quoted Title')
  })

  it('strips double quotes from values', () => {
    const content = `---\ntitle: "Double Quoted"\nstatus: completed\ncomplexity: XL\n---\n`
    const result = parseFrontmatter(content)
    expect(result?.title).toStrictEqual('Double Quoted')
  })
})

// ---------------------------------------------------------------------------
// slugFromPath
// ---------------------------------------------------------------------------

describe('slugFromPath', () => {
  it('extracts the parent directory name as slug', () => {
    expect(
      slugFromPath('/repo/blueprints/completed/agent-kit-parity-pass/_overview.md'),
    ).toStrictEqual('agent-kit-parity-pass')
  })

  it('handles in-progress directory', () => {
    expect(
      slugFromPath('/repo/blueprints/in-progress/blueprint-platform-sync/_overview.md'),
    ).toStrictEqual('blueprint-platform-sync')
  })

  it('handles Windows-style paths', () => {
    expect(slugFromPath('C:\\repo\\blueprints\\planned\\my-feature\\_overview.md')).toStrictEqual(
      'my-feature',
    )
  })
})

// ---------------------------------------------------------------------------
// deriveEventId
// ---------------------------------------------------------------------------

describe('deriveEventId', () => {
  it('returns a non-empty hex string', () => {
    const id = deriveEventId('agent-kit-parity-pass')
    expect(typeof id).toStrictEqual('string')
    expect(id.length).toStrictEqual(64) // sha256 hex = 64 chars
    expect(/^[0-9a-f]+$/.test(id)).toStrictEqual(true)
  })

  it('is deterministic — same slug always produces same id', () => {
    const id1 = deriveEventId('my-blueprint')
    const id2 = deriveEventId('my-blueprint')
    expect(id1).toStrictEqual(id2)
  })

  it('produces different ids for different slugs', () => {
    const id1 = deriveEventId('blueprint-a')
    const id2 = deriveEventId('blueprint-b')
    expect(id1).not.toStrictEqual(id2)
  })
})

// ---------------------------------------------------------------------------
// discoverBlueprints
// ---------------------------------------------------------------------------

describe('discoverBlueprints', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'wp-migrate-test-'))
  })

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('discovers blueprints from multiple lifecycle directories', () => {
    createBlueprintFixture(tmpRoot, 'completed', 'blueprint-alpha', VALID_FRONTMATTER)
    createBlueprintFixture(tmpRoot, 'planned', 'blueprint-beta', VALID_FRONTMATTER_B)

    const found = discoverBlueprints(tmpRoot)
    const slugs = found.map((b) => b.slug).sort()
    expect(slugs).toStrictEqual(['blueprint-alpha', 'blueprint-beta'])
  })

  it('skips blueprints with invalid frontmatter', () => {
    createBlueprintFixture(tmpRoot, 'completed', 'valid-bp', VALID_FRONTMATTER)
    createBlueprintFixture(tmpRoot, 'completed', 'invalid-bp', FRONTMATTER_MISSING_STATUS)

    const found = discoverBlueprints(tmpRoot)
    expect(found).toHaveLength(1)
    expect(found[0]?.slug).toStrictEqual('valid-bp')
  })

  it('returns empty array when blueprints directory does not exist', () => {
    const found = discoverBlueprints(join(tmpRoot, 'nonexistent'))
    expect(found).toStrictEqual([])
  })

  it('parses frontmatter fields correctly', () => {
    createBlueprintFixture(tmpRoot, 'in-progress', 'my-work', VALID_FRONTMATTER)

    const found = discoverBlueprints(tmpRoot)
    expect(found).toHaveLength(1)
    expect(found[0]?.frontmatter).toStrictEqual({
      title: 'Test Blueprint Alpha',
      status: 'planned',
      complexity: 'M',
    })
  })
})

// ---------------------------------------------------------------------------
// buildEvent
// ---------------------------------------------------------------------------

describe('buildEvent', () => {
  it('builds a blueprint.created event with deterministic eventId', () => {
    const blueprint = {
      slug: 'test-slug',
      overviewPath: '/any/path/_overview.md',
      frontmatter: { title: 'Test', status: 'planned', complexity: 'M' },
    }
    const event = buildEvent(blueprint, 'repo-abc')

    expect(event.type).toStrictEqual('blueprint.created')
    expect(event.repoId).toStrictEqual('repo-abc')
    expect(event.eventId).toStrictEqual(deriveEventId('test-slug'))
    expect(event.occurredAt).toStrictEqual('2026-01-01T00:00:00.000Z')
    expect(event.payload).toStrictEqual({
      type: 'blueprint.created',
      slug: 'test-slug',
      title: 'Test',
      status: 'planned',
      complexity: 'M',
    })
  })
})

// ---------------------------------------------------------------------------
// migrate — fixture blueprints pushed to mocked platform
// ---------------------------------------------------------------------------

describe('migrate', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'wp-migrate-test-'))
    setEnv('WP_BLUEPRINT_PLATFORM_TOKEN', 'test-token-for-migrate')
    setEnv('WP_BLUEPRINT_PLATFORM_URL', 'https://api.example.com')
    setEnv('WP_BLUEPRINT_PLATFORM_DISABLED', undefined)
  })

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
    setEnv('WP_BLUEPRINT_PLATFORM_TOKEN', undefined)
    setEnv('WP_BLUEPRINT_PLATFORM_URL', undefined)
    setEnv('WP_BLUEPRINT_PLATFORM_DISABLED', undefined)
    vi.clearAllMocks()
  })

  it('pushes all discovered blueprints to the mocked platform', async () => {
    createBlueprintFixture(tmpRoot, 'completed', 'bp-alpha', VALID_FRONTMATTER)
    createBlueprintFixture(tmpRoot, 'planned', 'bp-beta', VALID_FRONTMATTER_B)

    const fetchFn = makeFetchOk(200)
    await migrate(tmpRoot, fetchFn)

    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('each call uses the correct endpoint', async () => {
    createBlueprintFixture(tmpRoot, 'completed', 'bp-only', VALID_FRONTMATTER)

    const fetchFn = makeFetchOk(200)
    await migrate(tmpRoot, fetchFn)

    const [url] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toStrictEqual('https://api.example.com/v1/blueprint-events')
  })

  it('sends deterministic eventIds — re-run produces the same event IDs', async () => {
    createBlueprintFixture(tmpRoot, 'completed', 'bp-idempotent', VALID_FRONTMATTER)

    const fetchFn1 = makeFetchOk(200)
    await migrate(tmpRoot, fetchFn1)

    const fetchFn2 = makeFetchOk(200)
    await migrate(tmpRoot, fetchFn2)

    const extractEventId = (calls: unknown[][]): string => {
      const [, init] = calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      return body['eventId'] as string
    }

    const id1 = extractEventId(fetchFn1.mock.calls)
    const id2 = extractEventId(fetchFn2.mock.calls)
    expect(id1).toStrictEqual(id2)
    expect(id1).toStrictEqual(deriveEventId('bp-idempotent'))
  })

  it('sends blueprint.created as event type', async () => {
    createBlueprintFixture(tmpRoot, 'draft', 'bp-draft', VALID_FRONTMATTER)

    const fetchFn = makeFetchOk(200)
    await migrate(tmpRoot, fetchFn)

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body['type']).toStrictEqual('blueprint.created')
  })

  it('does nothing when WP_BLUEPRINT_PLATFORM_DISABLED=1', async () => {
    createBlueprintFixture(tmpRoot, 'completed', 'bp-disabled', VALID_FRONTMATTER)
    setEnv('WP_BLUEPRINT_PLATFORM_DISABLED', '1')

    const fetchFn = makeFetchOk(200)
    await migrate(tmpRoot, fetchFn)

    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('does nothing when no token is set', async () => {
    createBlueprintFixture(tmpRoot, 'completed', 'bp-no-token', VALID_FRONTMATTER)
    setEnv('WP_BLUEPRINT_PLATFORM_TOKEN', undefined)

    const fetchFn = makeFetchOk(200)
    await migrate(tmpRoot, fetchFn)

    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('handles 409 (idempotent duplicate) without throwing', async () => {
    createBlueprintFixture(tmpRoot, 'completed', 'bp-dup', VALID_FRONTMATTER)

    const fetchFn = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValue(new Response('', { status: 409 }))
    await expect(migrate(tmpRoot, fetchFn)).resolves.toStrictEqual(undefined)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('sends the correct slug in the event payload', async () => {
    createBlueprintFixture(tmpRoot, 'in-progress', 'my-feature-slug', VALID_FRONTMATTER)

    const fetchFn = makeFetchOk(200)
    await migrate(tmpRoot, fetchFn)

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    const payload = body['payload'] as Record<string, unknown>
    expect(payload['slug']).toStrictEqual('my-feature-slug')
  })
})
