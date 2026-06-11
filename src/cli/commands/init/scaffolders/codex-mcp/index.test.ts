import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  CONTEXT_MODE_MCP_HEADER,
  CONTEXT_MODE_MCP_SERVER_NAME,
  WEBPRESSO_MCP_HEADER,
  PLAYWRIGHT_MCP_HEADER,
  agentKitMcpBlock,
  ensureClaudePlaywrightMcp,
  ensureCodexContextModeMcp,
  ensureCodexWebpressoMcp,
  ensureCodexPlaywrightMcp,
  findWebpressoMcpEntry,
  upsertClaudePlaywrightMcpServer,
  upsertContextModeMcpServer,
  upsertWebpressoMcpServer,
  upsertPlaywrightMcpServer,
} from './index.js'

describe('upsertPlaywrightMcpServer', () => {
  it('appends the Playwright MCP server to an existing Codex config', () => {
    const next = upsertPlaywrightMcpServer('model = "gpt-5.4"\n')

    expect(next).toContain('model = "gpt-5.4"')
    expect(next).toContain(PLAYWRIGHT_MCP_HEADER)
    expect(next).toContain('args = ["dlx", "@playwright/mcp@latest"')
    expect(next).toContain('enabled = true')
    expect(next).toContain('startup_timeout_sec = 30')
  })

  it('replaces an existing Playwright MCP block without touching following tables', () => {
    const next = upsertPlaywrightMcpServer(`[mcp_servers.playwright]
command = "old"
args = ["old"]

[mcp_servers.webpresso]
command = "wp"
`)

    expect(next).toContain('command = "vp"')
    expect(next).not.toContain('command = "old"')
    expect(next).toContain('[mcp_servers.webpresso]\ncommand = "wp"')
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
    dir = mkdtempSync(join(tmpdir(), 'wp-codex-mcp-'))
    const configPath = join(dir, 'config.toml')

    const result = ensureCodexPlaywrightMcp({
      options: { overwrite: false, dryRun: false },
      configPath,
    })

    expect(result).toEqual({ kind: 'codex-playwright-mcp-written', path: configPath })
    expect(readFileSync(configPath, 'utf8')).toContain(PLAYWRIGHT_MCP_HEADER)
  })

  it('is idempotent when the desired server block is already present', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-codex-mcp-'))
    const configPath = join(dir, 'config.toml')
    ensureCodexPlaywrightMcp({ options: { overwrite: false, dryRun: false }, configPath })

    const result = ensureCodexPlaywrightMcp({
      options: { overwrite: false, dryRun: false },
      configPath,
    })

    expect(result).toEqual({ kind: 'codex-playwright-mcp-unchanged', path: configPath })
  })

  it('does not write in dry-run mode', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-codex-mcp-'))
    const configPath = join(dir, 'config.toml')

    const result = ensureCodexPlaywrightMcp({
      options: { overwrite: false, dryRun: true },
      configPath,
    })

    expect(result).toEqual({ kind: 'codex-playwright-mcp-skipped-dry-run', path: configPath })
    expect(existsSync(configPath)).toBe(false)
  })
})

describe('upsertClaudePlaywrightMcpServer', () => {
  it('seeds mcpServers.playwright with the portable vp dlx launch on an empty file', () => {
    const next = JSON.parse(upsertClaudePlaywrightMcpServer('')) as {
      mcpServers: Record<string, { command: string; args: string[] }>
    }

    expect(next.mcpServers.playwright).toStrictEqual({
      command: 'vp',
      args: ['dlx', '@playwright/mcp@latest', '--caps=testing,storage,network,devtools'],
    })
  })

  it('replaces a broken hardcoded bin path while preserving other servers', () => {
    const raw = JSON.stringify({
      mcpServers: {
        context7: { type: 'http', url: 'https://mcp.context7.com/mcp' },
        playwright: { command: '/Users/ozby/.bun/bin/playwright-mcp' },
      },
    })

    const next = JSON.parse(upsertClaudePlaywrightMcpServer(raw)) as {
      mcpServers: Record<string, { command: string; args?: string[]; url?: string }>
    }

    expect(next.mcpServers.context7).toStrictEqual({
      type: 'http',
      url: 'https://mcp.context7.com/mcp',
    })
    expect(next.mcpServers.playwright).toStrictEqual({
      command: 'vp',
      args: ['dlx', '@playwright/mcp@latest', '--caps=testing,storage,network,devtools'],
    })
  })

  it('throws on a non-empty file that is not valid JSON', () => {
    expect(() => upsertClaudePlaywrightMcpServer('not json {')).toThrow(/not valid JSON/)
  })
})

describe('ensureClaudePlaywrightMcp', () => {
  let dir: string | null = null

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('writes a missing .mcp.json under the repo root', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-claude-mcp-'))
    const configPath = join(dir, '.mcp.json')

    const result = ensureClaudePlaywrightMcp({
      options: { overwrite: false, dryRun: false },
      repoRoot: dir,
    })

    expect(result).toStrictEqual({ kind: 'claude-playwright-mcp-written', path: configPath })
    const written = JSON.parse(readFileSync(configPath, 'utf8')) as {
      mcpServers: Record<string, { command: string }>
    }
    expect(written.mcpServers.playwright.command).toBe('vp')
  })

  it('repairs a broken hardcoded playwright bin path in place', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-claude-mcp-'))
    const configPath = join(dir, '.mcp.json')
    writeFileSync(
      configPath,
      `${JSON.stringify({ mcpServers: { playwright: { command: '/Users/ozby/.bun/bin/playwright-mcp' } } }, null, 2)}\n`,
      'utf8',
    )

    const result = ensureClaudePlaywrightMcp({
      options: { overwrite: false, dryRun: false },
      configPath,
      repoRoot: dir,
    })

    expect(result).toStrictEqual({ kind: 'claude-playwright-mcp-written', path: configPath })
    expect(readFileSync(configPath, 'utf8')).not.toContain('/Users/ozby/.bun/bin/playwright-mcp')
  })

  it('is idempotent when the desired server is already present', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-claude-mcp-'))
    const configPath = join(dir, '.mcp.json')
    ensureClaudePlaywrightMcp({ options: { overwrite: false, dryRun: false }, repoRoot: dir })

    const result = ensureClaudePlaywrightMcp({
      options: { overwrite: false, dryRun: false },
      repoRoot: dir,
    })

    expect(result).toStrictEqual({ kind: 'claude-playwright-mcp-unchanged', path: configPath })
  })

  it('does not write in dry-run mode', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-claude-mcp-'))
    const configPath = join(dir, '.mcp.json')

    const result = ensureClaudePlaywrightMcp({
      options: { overwrite: false, dryRun: true },
      repoRoot: dir,
    })

    expect(result).toStrictEqual({
      kind: 'claude-playwright-mcp-skipped-dry-run',
      path: configPath,
    })
    expect(existsSync(configPath)).toBe(false)
  })

  it('leaves an invalid-JSON .mcp.json untouched and reports it', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-claude-mcp-'))
    const configPath = join(dir, '.mcp.json')
    writeFileSync(configPath, 'not json {', 'utf8')

    const result = ensureClaudePlaywrightMcp({
      options: { overwrite: false, dryRun: false },
      repoRoot: dir,
    })

    expect(result).toStrictEqual({ kind: 'claude-playwright-mcp-invalid-json', path: configPath })
    expect(readFileSync(configPath, 'utf8')).toBe('not json {')
  })
})

function makeFakeWebpressoInstall(root: string): string {
  const entry = join(root, 'src', 'mcp', 'cli.ts')
  mkdirSync(join(root, 'src', 'mcp'), { recursive: true })
  writeFileSync(entry, '#!/usr/bin/env bun\n', 'utf8')
  return entry
}

describe('findWebpressoMcpEntry', () => {
  let dir: string | null = null

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('returns the first candidate that contains src/mcp/cli.ts', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-find-'))
    const goodRoot = join(dir, 'good')
    const badRoot = join(dir, 'missing')
    const expected = makeFakeWebpressoInstall(goodRoot)

    const found = findWebpressoMcpEntry({ candidates: [badRoot, goodRoot] })

    expect(found).toBe(expected)
  })

  it('returns null when none of the candidates contain the entry', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-find-empty-'))
    const found = findWebpressoMcpEntry({
      candidates: [join(dir, 'a'), join(dir, 'b')],
    })

    expect(found).toBeNull()
  })

  it('honors the pnpm/npm probe seams when no claude/bun candidate exists', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-find-pnpm-'))
    const pnpmRoot = join(dir, 'pnpm-store')
    const expected = makeFakeWebpressoInstall(join(pnpmRoot, '@webpresso', 'webpresso'))

    const found = findWebpressoMcpEntry({
      candidates: [
        join(dir, 'no-claude'),
        join(dir, 'no-bun'),
        join(pnpmRoot, '@webpresso', 'webpresso'),
      ],
    })

    expect(found).toBe(expected)
  })
})

describe('agentKitMcpBlock + upsertWebpressoMcpServer', () => {
  it('renders bun + absolute path in the block', () => {
    const block = agentKitMcpBlock('/abs/path/src/mcp/cli.ts')
    expect(block).toContain(WEBPRESSO_MCP_HEADER)
    expect(block).toContain('command = "bun"')
    expect(block).toContain('args = ["/abs/path/src/mcp/cli.ts"]')
    expect(block).toContain('enabled = true')
  })

  it('appends to an empty config', () => {
    const next = upsertWebpressoMcpServer('', '/abs/path/src/mcp/cli.ts')
    expect(next).toContain(WEBPRESSO_MCP_HEADER)
    expect(next).toContain('args = ["/abs/path/src/mcp/cli.ts"]')
  })

  it('replaces an existing webpresso block without touching following tables', () => {
    const next = upsertWebpressoMcpServer(
      `[mcp_servers.webpresso]
command = "old"
args = ["old"]

[mcp_servers.playwright]
command = "vp"
`,
      '/new/path/src/mcp/cli.ts',
    )

    expect(next).toContain('args = ["/new/path/src/mcp/cli.ts"]')
    expect(next).not.toContain('command = "old"')
    expect(next).toContain('[mcp_servers.playwright]\ncommand = "vp"')
    expect(next.match(/\[mcp_servers\.webpresso\]/g)).toHaveLength(1)
  })

  it('coexists with the playwright block when both upserts run on the same config', () => {
    const withPlaywright = upsertPlaywrightMcpServer('model = "gpt-5.4"\n')
    const withBoth = upsertWebpressoMcpServer(withPlaywright, '/abs/src/mcp/cli.ts')

    expect(withBoth).toContain(PLAYWRIGHT_MCP_HEADER)
    expect(withBoth).toContain(WEBPRESSO_MCP_HEADER)
    expect(withBoth.match(/\[mcp_servers\.playwright\]/g)).toHaveLength(1)
    expect(withBoth.match(/\[mcp_servers\.webpresso\]/g)).toHaveLength(1)
  })
})

describe('upsertContextModeMcpServer', () => {
  it('appends the context-mode MCP block to an existing config', () => {
    const next = upsertContextModeMcpServer('model = "gpt-5.4"\n')

    expect(next).toContain('model = "gpt-5.4"')
    expect(next).toContain(CONTEXT_MODE_MCP_HEADER)
    expect(next).toContain(`command = "${CONTEXT_MODE_MCP_SERVER_NAME}"`)
  })

  it('replaces an existing context-mode block without touching following tables', () => {
    const next = upsertContextModeMcpServer(
      `[mcp_servers.context-mode]\ncommand = "old"\n\n[mcp_servers.webpresso]\ncommand = "wp"\n`,
    )

    expect(next).toContain(`command = "${CONTEXT_MODE_MCP_SERVER_NAME}"`)
    expect(next).not.toContain('command = "old"')
    expect(next).toContain('[mcp_servers.webpresso]\ncommand = "wp"')
    expect(next.match(/\[mcp_servers\.context-mode\]/g)).toHaveLength(1)
  })

  it('is idempotent — a second upsert leaves the output unchanged', () => {
    const first = upsertContextModeMcpServer('')
    const second = upsertContextModeMcpServer(first)

    expect(second).toBe(first)
  })

  it('coexists with the playwright and webpresso blocks in the same config', () => {
    const withPlaywright = upsertPlaywrightMcpServer('model = "gpt-5.4"\n')
    const withWebpresso = upsertWebpressoMcpServer(withPlaywright, '/abs/src/mcp/cli.ts')
    const withAll = upsertContextModeMcpServer(withWebpresso)

    expect(withAll).toContain(PLAYWRIGHT_MCP_HEADER)
    expect(withAll).toContain(WEBPRESSO_MCP_HEADER)
    expect(withAll).toContain(CONTEXT_MODE_MCP_HEADER)
    expect(withAll.match(/\[mcp_servers\./g)).toHaveLength(3)
  })
})

describe('ensureCodexContextModeMcp', () => {
  let dir: string | null = null

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('creates config.toml with the context-mode MCP block when file is absent', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-codex-ctxmcp-'))
    const configPath = join(dir, 'config.toml')

    const result = ensureCodexContextModeMcp({ options: {}, configPath })

    expect(result.action).toBe('created')
    expect(readFileSync(configPath, 'utf8')).toContain(CONTEXT_MODE_MCP_HEADER)
    expect(readFileSync(configPath, 'utf8')).toContain(`command = "${CONTEXT_MODE_MCP_SERVER_NAME}"`)
  })

  it('is idempotent when the block is already present', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-codex-ctxmcp-'))
    const configPath = join(dir, 'config.toml')
    ensureCodexContextModeMcp({ options: {}, configPath })

    const result = ensureCodexContextModeMcp({ options: {}, configPath })

    expect(result.action).toBe('identical')
  })

  it('does not write in dry-run mode', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-codex-ctxmcp-'))
    const configPath = join(dir, 'config.toml')

    const result = ensureCodexContextModeMcp({ options: { dryRun: true }, configPath })

    expect(result.action).toBe('skipped-dry')
    expect(existsSync(configPath)).toBe(false)
  })

  it('appends to an existing config and returns overwritten', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-codex-ctxmcp-existing-'))
    const configPath = join(dir, 'config.toml')
    ensureCodexPlaywrightMcp({ options: {}, configPath })

    const result = ensureCodexContextModeMcp({ options: {}, configPath })

    expect(result.action).toBe('overwritten')
    const content = readFileSync(configPath, 'utf8')
    expect(content).toContain(PLAYWRIGHT_MCP_HEADER)
    expect(content).toContain(CONTEXT_MODE_MCP_HEADER)
    expect(content.match(/\[mcp_servers\./g)).toHaveLength(2)
  })
})

describe('ensureCodexWebpressoMcp', () => {
  let dir: string | null = null

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('writes the webpresso MCP block when an install root is found', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-codex-akmcp-'))
    const configPath = join(dir, 'config.toml')
    const entryPath = makeFakeWebpressoInstall(join(dir, 'install'))

    const result = ensureCodexWebpressoMcp({
      options: { overwrite: false, dryRun: false },
      configPath,
      entryPath,
    })

    expect(result).toEqual({ kind: 'codex-webpresso-mcp-written', path: configPath, entryPath })
    expect(readFileSync(configPath, 'utf8')).toContain(`args = ["${entryPath}"]`)
  })

  it('is idempotent on a second invocation', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-codex-akmcp-'))
    const configPath = join(dir, 'config.toml')
    const entryPath = makeFakeWebpressoInstall(join(dir, 'install'))
    ensureCodexWebpressoMcp({
      options: { overwrite: false, dryRun: false },
      configPath,
      entryPath,
    })

    const result = ensureCodexWebpressoMcp({
      options: { overwrite: false, dryRun: false },
      configPath,
      entryPath,
    })

    expect(result).toEqual({ kind: 'codex-webpresso-mcp-unchanged', path: configPath, entryPath })
  })

  it('skips writes in dry-run mode', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-codex-akmcp-'))
    const configPath = join(dir, 'config.toml')

    const result = ensureCodexWebpressoMcp({
      options: { overwrite: false, dryRun: true },
      configPath,
      entryPath: '/anything',
    })

    expect(result).toEqual({ kind: 'codex-webpresso-mcp-skipped-dry-run', path: configPath })
    expect(existsSync(configPath)).toBe(false)
  })

  it('returns the not-installed result and does not write when no install root is found', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-codex-akmcp-'))
    const configPath = join(dir, 'config.toml')

    const result = ensureCodexWebpressoMcp({
      options: { overwrite: false, dryRun: false },
      configPath,
      probe: {
        candidates: [join(dir, 'a'), join(dir, 'b')],
      },
    })

    expect(result.kind).toBe('codex-webpresso-mcp-not-installed')
    if (result.kind === 'codex-webpresso-mcp-not-installed') {
      expect(result.checked).toEqual([join(dir, 'a'), join(dir, 'b')])
    }
    expect(existsSync(configPath)).toBe(false)
  })
})
