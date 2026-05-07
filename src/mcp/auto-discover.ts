/**
 * Tool auto-discovery for the `ak mcp` server.
 *
 * Scans a directory for `*.ts` (source) or `*.js` (built) files, dynamic-imports
 * each, and registers any default-exported {@link ToolDescriptor} on the
 * provided server. Skips test files (`*.test.*`, `*.integration.test.*`) and
 * type-declaration files.
 *
 * Adding a new tool is a one-file affair: drop `src/mcp/tools/<name>.ts` with a
 * default export and the server picks it up at startup. No edits to
 * `server.ts` required.
 */

import { readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z, type ZodType } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

export interface ContentBlock {
  readonly type: string
  readonly text?: string
  readonly [key: string]: unknown
}

export interface ToolHandlerResult {
  readonly content: readonly ContentBlock[]
  readonly structuredContent?: Record<string, unknown>
  readonly isError?: boolean
}

/**
 * MCP tool annotations (spec 2025-03-26). Servers MUST opt into read-only /
 * idempotent / closed-world; clients otherwise pessimize and gate every call
 * behind a confirmation prompt. Set explicitly per tool — defaults are
 * intentionally pessimistic.
 */
export interface ToolAnnotations {
  readonly title?: string
  readonly readOnlyHint?: boolean
  readonly destructiveHint?: boolean
  readonly idempotentHint?: boolean
  readonly openWorldHint?: boolean
}

export interface ToolHandlerExtra {
  readonly signal?: AbortSignal
}

export type ToolHandler = (input: unknown, extra?: ToolHandlerExtra) => Promise<ToolHandlerResult>

export interface ToolDescriptor {
  readonly name: string
  readonly description: string
  readonly inputSchema: ZodType<unknown> | { _def: unknown; parse: (x: unknown) => unknown }
  readonly outputSchema?: ZodType<unknown> | { _def: unknown; parse: (x: unknown) => unknown }
  readonly handler: ToolHandler
  readonly annotations?: ToolAnnotations
}

/**
 * Minimal server contract used by the auto-discovery loop. The real MCP
 * `Server` instance and `McpServer` instance both implement a richer surface,
 * but discovery only needs `registerTool`. Keeping the shape minimal makes the
 * function trivially fakeable in tests.
 */
export interface ToolRegistrar {
  registerTool(
    name: string,
    description: string,
    jsonSchema: Record<string, unknown>,
    outputSchema: Record<string, unknown> | undefined,
    handler: ToolHandler,
    annotations?: ToolAnnotations,
  ): void
}

const SKIP_SUFFIXES = ['.test.ts', '.test.js', '.integration.test.ts', '.integration.test.js']
const SUPPORTED_EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.cjs'])

function shouldSkip(file: string): boolean {
  if (file.endsWith('.d.ts') || file.endsWith('.d.ts.map')) return true
  if (file.endsWith('.js.map') || file.endsWith('.ts.map')) return true
  for (const suffix of SKIP_SUFFIXES) {
    if (file.endsWith(suffix)) return true
  }
  const ext = extname(file)
  if (!SUPPORTED_EXTENSIONS.has(ext)) return true
  return false
}

type ZodToJsonSchemaInput = Parameters<typeof zodToJsonSchema>[0]

function isPlainObjectSchema(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && Object.keys(value as object).length > 1
}

/**
 * Convert a tool's zod input schema to a JSON Schema for MCP. Prefers zod v4's
 * native `toJSONSchema` (the package pins ^4.3.6); falls through to the
 * `zod-to-json-schema` v3 adapter; and finally throws — silent fallback to a
 * permissive `{type:'object'}` would mask schema bugs by accepting any input.
 *
 * The lone permitted fallback is for *bare-shape* descriptors used by tests
 * (`{ _def, parse }` ducks that aren't zod instances). Those cannot be
 * auto-converted; we still mark them explicitly via `bareShape: true` rather
 * than silently producing an empty schema, so the MCP client sees the
 * limitation.
 */
// Real zod v4 schemas carry an internal `_zod` marker. The bare-shape ducks
// used by `auto-discover.test.ts` (`{ _def, parse }`) do not — discriminate
// on that to keep philosophy gates intact: bare shapes get an explicit
// `bareShape: true` JSON Schema (no silent fallback), and neither input
// reaches an exception-swallowing try/catch.
function isZodV4Instance(schema: unknown): schema is ZodToJsonSchemaInput {
  return Boolean(schema) && typeof schema === 'object' && '_zod' in (schema as object)
}

function isBareShapeDuck(schema: unknown): boolean {
  return (
    Boolean(schema) &&
    typeof schema === 'object' &&
    '_def' in (schema as object) &&
    'parse' in (schema as object)
  )
}

function toJsonSchema(schema: ToolDescriptor['inputSchema']): Record<string, unknown> {
  if (isZodV4Instance(schema)) {
    const ztoj = (z as unknown as { toJSONSchema?: (s: unknown) => Record<string, unknown> })
      .toJSONSchema
    if (typeof ztoj === 'function') {
      const result = ztoj(schema)
      if (isPlainObjectSchema(result)) return result
    }

    const v3Result = zodToJsonSchema(schema) as unknown
    if (isPlainObjectSchema(v3Result)) return v3Result

    throw new Error(
      'Cannot derive JSON Schema from zod schema — ' +
        'neither zod v4 toJSONSchema nor zod-to-json-schema produced a usable result',
    )
  }

  if (isBareShapeDuck(schema)) {
    return { type: 'object', bareShape: true }
  }

  throw new Error('Tool input schema is neither a zod schema nor a recognised bare shape')
}

export async function discoverTools(
  server: ToolRegistrar,
  toolsDir: string,
): Promise<ToolDescriptor[]> {
  const entries = await readdir(toolsDir, { withFileTypes: true })
  const registered: ToolDescriptor[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (shouldSkip(entry.name)) continue

    const fullPath = join(toolsDir, entry.name)
    const moduleUrl = pathToFileURL(fullPath).href
    const mod = (await import(moduleUrl)) as { default?: ToolDescriptor }
    const descriptor = mod.default
    if (!descriptor || typeof descriptor !== 'object') {
      throw new Error(`Tool file ${fullPath} has no default export`)
    }
    if (typeof descriptor.name !== 'string' || typeof descriptor.handler !== 'function') {
      throw new Error(`Tool file ${fullPath} default export is malformed (missing name or handler)`)
    }

    const jsonSchema = toJsonSchema(descriptor.inputSchema)
    const outputSchema = descriptor.outputSchema ? toJsonSchema(descriptor.outputSchema) : undefined
    server.registerTool(
      descriptor.name,
      descriptor.description,
      jsonSchema,
      outputSchema,
      descriptor.handler,
      descriptor.annotations,
    )
    registered.push(descriptor)
  }

  return registered
}
