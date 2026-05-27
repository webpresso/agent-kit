import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

import { openDb } from '#db/connection.js'
import { ingestBlueprints } from '#db/ingester.js'
import { resolveBlueprintProjectionDbPath } from '#db/paths.js'
import { recordProjectionMetadata } from '#freshness.js'

import type { ToolHandler, ToolHandlerResult, ToolRegistrar } from './auto-discover.js'
import { registerBlueprintTools } from './blueprint-server.js'

export type RegisteredTool = { name: string; handler: ToolHandler }
export type ToolMap = Map<string, RegisteredTool>

export interface BlueprintFixture {
  readonly stateDir: string
  readonly slug: string
  readonly content: string
}

export function makeRegistrar(): { registrar: ToolRegistrar; tools: ToolMap } {
  const tools = new Map<string, RegisteredTool>()
  const registrar: ToolRegistrar = {
    registerTool(name, _desc, _schema, _outSchema, handler) {
      tools.set(name, { name, handler })
    },
  }
  return { registrar, tools }
}

export async function callTool(
  tools: ToolMap,
  name: string,
  input: unknown,
): Promise<ToolHandlerResult> {
  const tool = tools.get(name)
  if (!tool) throw new Error(`Tool "${name}" not registered`)
  return tool.handler(input)
}

export function parseResult<T = unknown>(result: ToolHandlerResult): T {
  const text = result.content[0]
  if (!text || text.type !== 'text' || typeof text.text !== 'string') {
    throw new Error('Expected text content block')
  }
  return JSON.parse(text.text) as T
}

export function createTempBlueprintRepo(prefix = 'ak-bs-test-'): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  mkdirSync(path.join(dir, '.agent'), { recursive: true })
  mkdirSync(path.join(dir, 'blueprints', 'draft'), { recursive: true })
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'test' }), 'utf8')
  return dir
}

export function writeBlueprintFixture(
  cwd: string,
  fixture: BlueprintFixture,
): { overviewPath: string } {
  const overviewPath = path.join(
    cwd,
    'blueprints',
    fixture.stateDir,
    fixture.slug,
    '_overview.md',
  )
  mkdirSync(path.dirname(overviewPath), { recursive: true })
  writeFileSync(overviewPath, fixture.content, 'utf8')
  return { overviewPath }
}

export async function registerBlueprintToolMap(cwd: string): Promise<ToolMap> {
  const { registrar, tools } = makeRegistrar()
  await registerBlueprintTools(registrar, cwd)
  return tools
}

export async function makeLazyBlueprintHarness(
  prefix = 'ak-bs-test-',
): Promise<{ tmpDir: string; tools: ToolMap }> {
  const tmpDir = createTempBlueprintRepo(prefix)
  const tools = await registerBlueprintToolMap(tmpDir)
  return { tmpDir, tools }
}

export async function makeProjectionBackedBlueprintHarness(
  prefix: string,
  fixtures: readonly BlueprintFixture[],
): Promise<{ tmpDir: string; tools: ToolMap; overviewPaths: string[] }> {
  const tmpDir = createTempBlueprintRepo(prefix)
  const overviewPaths = fixtures.map((fixture) => writeBlueprintFixture(tmpDir, fixture).overviewPath)
  await bootstrapBlueprintProjection(tmpDir)
  const tools = await registerBlueprintToolMap(tmpDir)
  return { tmpDir, tools, overviewPaths }
}

export async function bootstrapBlueprintProjection(cwd: string): Promise<string> {
  const dbFile = resolveBlueprintProjectionDbPath(cwd)
  mkdirSync(path.dirname(dbFile), { recursive: true })
  const conn = openDb(dbFile)
  try {
    await ingestBlueprints({ db: conn.db, cwd })
  } finally {
    conn.close()
  }
  recordProjectionMetadata({ dbPath: dbFile, cwd, ingestedAt: Date.now() })
  return dbFile
}

export function cleanupTempDir(dir: string | undefined): void {
  if (dir) rmSync(dir, { recursive: true, force: true })
}

export function markBlueprintValidated(cwd: string, slug: string, timestamp = Date.now() + 10_000): void {
  const validateTimestampPath = path.join(cwd, '.agent', '.validate-timestamps.json')
  mkdirSync(path.dirname(validateTimestampPath), { recursive: true })
  writeFileSync(
    validateTimestampPath,
    JSON.stringify({ [slug]: timestamp }, null, 2) + '\n',
    'utf8',
  )
}

export function writeStaleProjectionMetadata(cwd: string): void {
  writeFileSync(
    `${resolveBlueprintProjectionDbPath(cwd)}.meta.json`,
    JSON.stringify({ head_at_ingest: 'deadbeef'.repeat(5), ingested_at: 1 }) + '\n',
    'utf8',
  )
}

export function makeLocalBlueprintRepo(
  slug: string,
  content = VALID_BLUEPRINT,
): {
  dir: string
  overviewPath: string
} {
  const dir = createTempBlueprintRepo('ak-bs-local-bp-')
  const { overviewPath } = writeBlueprintFixture(dir, { stateDir: 'draft', slug, content })
  return { dir, overviewPath }
}

export const VALID_BLUEPRINT = `---
type: blueprint
title: My Feature Blueprint
status: draft
complexity: M
owner: alice
created: '2026-01-15'
last_updated: '2026-04-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — ship feature X
- **Consuming surface:** /dashboard route
- **New user-visible capability:** Users can see feature X on the dashboard.

## Summary

A well-formed blueprint for testing.

#### Task 1.1: Do the thing

**Status:** todo
**Wave:** 0

**Acceptance:**
- [ ] The thing is done
`

export const INVALID_BLUEPRINT_MISSING_WEDGE = `---
type: blueprint
title: Bad Blueprint
status: draft
complexity: M
owner: alice
created: '2026-01-15'
last_updated: '2026-04-01'
---

## Summary

This blueprint is missing the product wedge anchor and task acceptance.

#### Task 1.1: Do the thing

**Status:** todo
`

export const INVALID_BLUEPRINT_NO_TASKS = `---
type: blueprint
title: No Tasks Blueprint
status: draft
complexity: S
owner: bob
created: '2026-01-15'
last_updated: '2026-04-01'
---

## Product wedge anchor

- **Stage outcome:** something
- **Consuming surface:** /somewhere
- **New user-visible capability:** something

## Summary

Blueprint with no task sections at all.
`

export const INVALID_BLUEPRINT_MISSING_FRONTMATTER = `---
type: blueprint
title: ''
status: draft
complexity: M
---

## Product wedge anchor

- **Stage outcome:** x
- **Consuming surface:** /x
- **New user-visible capability:** x

#### Task 1.1: A task

**Status:** todo

**Acceptance:**
- [ ] something
`
