import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  AGENT_KIT_MCP_HEADER,
  PLAYWRIGHT_MCP_HEADER,
  agentKitMcpBlock,
  ensureCodexAgentKitMcp,
  ensureCodexPlaywrightMcp,
  findAgentKitMcpEntry,
  upsertAgentKitMcpServer,
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

function makeFakeAgentKitInstall(root: string): string {
  const entry = join(root, 'src', 'mcp', 'cli.ts')
  mkdirSync(join(root, 'src', 'mcp'), { recursive: true })
  writeFileSync(entry, '#!/usr/bin/env bun\n', 'utf8')
  return entry
}

describe('findAgentKitMcpEntry', () => {
  let dir: string | null = null

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('returns the first candidate that contains src/mcp/cli.ts', () => {
    dir = mkdtempSync(join(tmpdir(), 'ak-find-'))
    const goodRoot = join(dir, 'good')
    const badRoot = join(dir, 'missing')
    const expected = makeFakeAgentKitInstall(goodRoot)

    const found = findAgentKitMcpEntry({ candidates: [badRoot, goodRoot] })

    expect(found).toBe(expected)
  })

  it('returns null when none of the candidates contain the entry', () => {
    dir = mkdtempSync(join(tmpdir(), 'ak-find-empty-'))
    const found = findAgentKitMcpEntry({
      candidates: [join(dir, 'a'), join(dir, 'b')],
    })

    expect(found).toBeNull()
  })

  it('honors the pnpm/npm probe seams when no claude/bun candidate exists', () => {
    dir = mkdtempSync(join(tmpdir(), 'ak-find-pnpm-'))
    const pnpmRoot = join(dir, 'pnpm-store')
    const expected = makeFakeAgentKitInstall(join(pnpmRoot, '@webpresso', 'agent-kit'))

    const found = findAgentKitMcpEntry({
      candidates: [join(dir, 'no-claude'), join(dir, 'no-bun'), join(pnpmRoot, '@webpresso', 'agent-kit')],
    })

    expect(found).toBe(expected)
  })
})

describe('agentKitMcpBlock + upsertAgentKitMcpServer', () => {
  it('renders bun + absolute path in the block', () => {
    const block = agentKitMcpBlock('/abs/path/src/mcp/cli.ts')
    expect(block).toContain(AGENT_KIT_MCP_HEADER)
    expect(block).toContain('command = "bun"')
    expect(block).toContain('args = ["/abs/path/src/mcp/cli.ts"]')
    expect(block).toContain('enabled = true')
  })

  it('appends to an empty config', () => {
    const next = upsertAgentKitMcpServer('', '/abs/path/src/mcp/cli.ts')
    expect(next).toContain(AGENT_KIT_MCP_HEADER)
    expect(next).toContain('args = ["/abs/path/src/mcp/cli.ts"]')
  })

  it('replaces an existing agent-kit block without touching following tables', () => {
    const next = upsertAgentKitMcpServer(
      `[mcp_servers.agent-kit]
command = "old"
args = ["old"]

[mcp_servers.playwright]
command = "npx"
`,
      '/new/path/src/mcp/cli.ts',
    )

    expect(next).toContain('args = ["/new/path/src/mcp/cli.ts"]')
    expect(next).not.toContain('command = "old"')
    expect(next).toContain('[mcp_servers.playwright]\ncommand = "npx"')
    expect(next.match(/\[mcp_servers\.agent-kit\]/g)).toHaveLength(1)
  })

  it('coexists with the playwright block when both upserts run on the same config', () => {
    const withPlaywright = upsertPlaywrightMcpServer('model = "gpt-5.4"\n')
    const withBoth = upsertAgentKitMcpServer(withPlaywright, '/abs/src/mcp/cli.ts')

    expect(withBoth).toContain(PLAYWRIGHT_MCP_HEADER)
    expect(withBoth).toContain(AGENT_KIT_MCP_HEADER)
    expect(withBoth.match(/\[mcp_servers\.playwright\]/g)).toHaveLength(1)
    expect(withBoth.match(/\[mcp_servers\.agent-kit\]/g)).toHaveLength(1)
  })
})

describe('ensureCodexAgentKitMcp', () => {
  let dir: string | null = null

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('writes the agent-kit MCP block when an install root is found', () => {
    dir = mkdtempSync(join(tmpdir(), 'ak-codex-akmcp-'))
    const configPath = join(dir, 'config.toml')
    const entryPath = makeFakeAgentKitInstall(join(dir, 'install'))

    const result = ensureCodexAgentKitMcp({
      options: { overwrite: false, dryRun: false },
      configPath,
      entryPath,
    })

    expect(result).toEqual({ kind: 'codex-agent-kit-mcp-written', path: configPath, entryPath })
    expect(readFileSync(configPath, 'utf8')).toContain(`args = ["${entryPath}"]`)
  })

  it('is idempotent on a second invocation', () => {
    dir = mkdtempSync(join(tmpdir(), 'ak-codex-akmcp-'))
    const configPath = join(dir, 'config.toml')
    const entryPath = makeFakeAgentKitInstall(join(dir, 'install'))
    ensureCodexAgentKitMcp({
      options: { overwrite: false, dryRun: false },
      configPath,
      entryPath,
    })

    const result = ensureCodexAgentKitMcp({
      options: { overwrite: false, dryRun: false },
      configPath,
      entryPath,
    })

    expect(result).toEqual({ kind: 'codex-agent-kit-mcp-unchanged', path: configPath, entryPath })
  })

  it('skips writes in dry-run mode', () => {
    dir = mkdtempSync(join(tmpdir(), 'ak-codex-akmcp-'))
    const configPath = join(dir, 'config.toml')

    const result = ensureCodexAgentKitMcp({
      options: { overwrite: false, dryRun: true },
      configPath,
      entryPath: '/anything',
    })

    expect(result).toEqual({ kind: 'codex-agent-kit-mcp-skipped-dry-run', path: configPath })
    expect(existsSync(configPath)).toBe(false)
  })

  it('returns the not-installed result and does not write when no install root is found', () => {
    dir = mkdtempSync(join(tmpdir(), 'ak-codex-akmcp-'))
    const configPath = join(dir, 'config.toml')

    const result = ensureCodexAgentKitMcp({
      options: { overwrite: false, dryRun: false },
      configPath,
      probe: {
        candidates: [join(dir, 'a'), join(dir, 'b')],
      },
    })

    expect(result.kind).toBe('codex-agent-kit-mcp-not-installed')
    if (result.kind === 'codex-agent-kit-mcp-not-installed') {
      expect(result.checked).toEqual([join(dir, 'a'), join(dir, 'b')])
    }
    expect(existsSync(configPath)).toBe(false)
  })
})
