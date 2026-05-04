import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  PLAYWRIGHT_MCP_HEADER,
  ensureCodexPlaywrightMcp,
  upsertPlaywrightMcpServer,
} from './index.js'

describe('upsertPlaywrightMcpServer', () => {
  it('appends the Playwright MCP server to an existing Codex config', () => {
    const next = upsertPlaywrightMcpServer('model = "gpt-5.4"\n')

    expect(next).toContain('model = "gpt-5.4"')
    expect(next).toContain(PLAYWRIGHT_MCP_HEADER)
    expect(next).toContain('args = ["-y", "@playwright/mcp@latest"')
    expect(next).toContain('enabled = true')
    expect(next).toContain('startup_timeout_sec = 30')
  })

  it('replaces an existing Playwright MCP block without touching following tables', () => {
    const next = upsertPlaywrightMcpServer(`[mcp_servers.playwright]
command = "old"
args = ["old"]

[mcp_servers.agent-kit]
command = "ak"
`)

    expect(next).toContain('command = "npx"')
    expect(next).not.toContain('command = "old"')
    expect(next).toContain('[mcp_servers.agent-kit]\ncommand = "ak"')
    expect(next.match(/\[mcp_servers\.playwright\]/g)).toHaveLength(1)
  })
})

describe('ensureCodexPlaywrightMcp', () => {
  let dir: string | null = null

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('writes a missing config.toml under the supplied config path', () => {
    dir = mkdtempSync(join(tmpdir(), 'ak-codex-mcp-'))
    const configPath = join(dir, 'config.toml')

    const result = ensureCodexPlaywrightMcp({
      options: { overwrite: false, dryRun: false },
      configPath,
    })

    expect(result).toEqual({ kind: 'codex-playwright-mcp-written', path: configPath })
    expect(readFileSync(configPath, 'utf8')).toContain(PLAYWRIGHT_MCP_HEADER)
  })

  it('is idempotent when the desired server block is already present', () => {
    dir = mkdtempSync(join(tmpdir(), 'ak-codex-mcp-'))
    const configPath = join(dir, 'config.toml')
    ensureCodexPlaywrightMcp({ options: { overwrite: false, dryRun: false }, configPath })

    const result = ensureCodexPlaywrightMcp({
      options: { overwrite: false, dryRun: false },
      configPath,
    })

    expect(result).toEqual({ kind: 'codex-playwright-mcp-unchanged', path: configPath })
  })

  it('does not write in dry-run mode', () => {
    dir = mkdtempSync(join(tmpdir(), 'ak-codex-mcp-'))
    const configPath = join(dir, 'config.toml')

    const result = ensureCodexPlaywrightMcp({
      options: { overwrite: false, dryRun: true },
      configPath,
    })

    expect(result).toEqual({ kind: 'codex-playwright-mcp-skipped-dry-run', path: configPath })
    expect(existsSync(configPath)).toBe(false)
  })
})
