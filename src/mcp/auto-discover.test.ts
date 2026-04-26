import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { discoverTools, type ToolDescriptor } from './auto-discover.js'

interface RegisteredCall {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: ToolDescriptor['handler']
}

function makeFakeServer() {
  const calls: RegisteredCall[] = []
  return {
    calls,
    server: {
      registerTool(
        name: string,
        description: string,
        inputSchema: Record<string, unknown>,
        handler: ToolDescriptor['handler'],
      ): void {
        calls.push({ name, description, inputSchema, handler })
      },
    },
  }
}

function writeToolFile(dir: string, fileName: string, body: string): string {
  const filePath = join(dir, fileName)
  writeFileSync(filePath, body)
  return filePath
}

describe('discoverTools', () => {
  it('discovers and registers a tool from a *.js file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ak-mcp-discover-'))
    writeToolFile(
      dir,
      'sample.js',
      [
        'const fakeShape = { _def: { typeName: "ZodObject", shape: () => ({}) }, parse: (x) => x }',
        'export default {',
        '  name: "fixture_tool",',
        '  description: "fixture description",',
        '  inputSchema: fakeShape,',
        '  handler: async () => ({ content: [{ type: "text", text: "ok" }] }),',
        '}',
      ].join('\n'),
    )

    const fake = makeFakeServer()
    await discoverTools(fake.server, dir)
    const names = fake.calls.map((c) => c.name)
    expect(names).toContain('fixture_tool')
    const sample = fake.calls.find((c) => c.name === 'fixture_tool')
    expect(sample?.description).toBe('fixture description')
    // JSON Schema for an empty zod-like object is at minimum a non-null object.
    expect(typeof sample?.inputSchema).toBe('object')
  })

  it('skips *.test.* files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ak-mcp-discover-'))
    writeToolFile(
      dir,
      'good.js',
      [
        'const fakeShape = { _def: { typeName: "ZodObject", shape: () => ({}) }, parse: (x) => x }',
        'export default {',
        '  name: "good",',
        '  description: "good",',
        '  inputSchema: fakeShape,',
        '  handler: async () => ({ content: [{ type: "text", text: "ok" }] }),',
        '}',
      ].join('\n'),
    )
    writeToolFile(
      dir,
      'bad.test.js',
      [
        'const fakeShape = { _def: { typeName: "ZodObject", shape: () => ({}) }, parse: (x) => x }',
        'export default {',
        '  name: "bad",',
        '  description: "bad",',
        '  inputSchema: fakeShape,',
        '  handler: async () => ({ content: [{ type: "text", text: "bad" }] }),',
        '}',
      ].join('\n'),
    )
    const fake = makeFakeServer()
    await discoverTools(fake.server, dir)
    expect(fake.calls.map((c) => c.name)).toEqual(['good'])
  })

  it('passes through input via the registered handler', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ak-mcp-discover-'))
    writeToolFile(
      dir,
      'echo.js',
      [
        'const fakeShape = { _def: { typeName: "ZodObject", shape: () => ({}) }, parse: (x) => x }',
        'export default {',
        '  name: "echo",',
        '  description: "echo",',
        '  inputSchema: fakeShape,',
        '  handler: async (input) => ({ content: [{ type: "text", text: JSON.stringify(input) }] }),',
        '}',
      ].join('\n'),
    )
    const fake = makeFakeServer()
    await discoverTools(fake.server, dir)
    const call = fake.calls.find((c) => c.name === 'echo')
    expect(call).toBeDefined()
    const result = await call!.handler({ hi: 'there' })
    expect(result.content[0]).toMatchObject({ type: 'text', text: '{"hi":"there"}' })
  })

  it('keeps the descriptor type permissive enough for real zod schemas', () => {
    // Compile-time / runtime sanity: ensure ToolDescriptor allows a real z.object schema.
    const descriptor: ToolDescriptor = {
      name: 'x',
      description: 'y',
      inputSchema: z.object({ a: z.string() }),
      handler: async () => ({ content: [] }),
    }
    expect(descriptor.name).toBe('x')
  })
})
