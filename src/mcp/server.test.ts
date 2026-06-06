import { afterEach, describe, expect, test } from 'vitest'

import { isBunSingleFileModuleUrl, resolveDefaultToolLoadMode } from './server.js'

const originalToolMode = process.env.WP_MCP_TOOL_MODE
const originalCompiledRuntime = process.env.WP_COMPILED_RUNTIME

afterEach(() => {
  process.env.WP_MCP_TOOL_MODE = originalToolMode
  process.env.WP_COMPILED_RUNTIME = originalCompiledRuntime
})

describe('MCP server tool load mode', () => {
  test('detects Bun single-file executable module URLs', () => {
    expect(isBunSingleFileModuleUrl('file:///$bunfs/root/mcp/server.js')).toBe(true)
    expect(isBunSingleFileModuleUrl(import.meta.url)).toBe(false)
  })

  test('uses registry mode in compiled Bun single-file executables', () => {
    delete process.env.WP_MCP_TOOL_MODE
    delete process.env.WP_COMPILED_RUNTIME

    expect(resolveDefaultToolLoadMode('file:///$bunfs/root/mcp/server.js')).toBe('registry')
  })

  test('keeps filesystem discovery as the normal source checkout default', () => {
    delete process.env.WP_MCP_TOOL_MODE
    delete process.env.WP_COMPILED_RUNTIME

    expect(resolveDefaultToolLoadMode(import.meta.url)).toBe('filesystem')
  })
})
