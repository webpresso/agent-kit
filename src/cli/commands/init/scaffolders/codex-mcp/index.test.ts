import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  CLAUDE_CONTEXT7_API_KEY_REF,
  CONTEXT7_MCP_URL,
  WEBPRESSO_MCP_HEADER,
  PLAYWRIGHT_MCP_HEADER,
  agentKitMcpBlock,
  ensureClaudeContext7Mcp,
  ensureClaudePlaywrightMcp,
  ensureCodexContext7Mcp,
  ensureCodexWebpressoMcp,
  ensureCodexPlaywrightMcp,
  findWebpressoMcpEntry,
  upsertClaudeContext7McpServer,
  upsertClaudePlaywrightMcpServer,
  upsertContext7McpServer,
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

describe('upsertContext7McpServer', () => {
  it('appends the hosted Context7 server with env-backed headers', () => {
    const next = upsertContext7McpServer('model = "gpt-5.4"\n')

    expect(next).toContain('model = "gpt-5.4"')
    expect(next).toContain('[mcp_servers.context7]')
    expect(next).toContain(`url = "${CONTEXT7_MCP_URL}"`)
    expect(next).toContain('http_headers = { "Accept" = "application/json, text/event-stream" }')
    expect(next).toContain('env_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }')
  })

  it('replaces raw Context7 http_headers without touching following tables', () => {
    const next = upsertContext7McpServer(`[mcp_servers.context7]
url = "https://old.example/mcp"
http_headers = { "CONTEXT7_API_KEY" = "leaked-secret" }

[mcp_servers.playwright]
command = "vp"
`)

    expect(next).toContain(`url = "${CONTEXT7_MCP_URL}"`)
    expect(next).toContain('http_headers = { "Accept" = "application/json, text/event-stream" }')
    expect(next).toContain('env_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }')
    expect(next).not.toContain('leaked-secret')
    expect(next).toContain('[mcp_servers.playwright]\ncommand = "vp"')
    expect(next.match(/\[mcp_servers\.context7\]/g)).toHaveLength(1)
  })

  it('is idempotent once the desired block exists', () => {
    const next = upsertContext7McpServer('')
    expect(upsertContext7McpServer(next)).toBe(next)
  })
})

describe('ensureCodexContext7Mcp', () => {
  let dir: string | null = null

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('writes a missing config.toml under the supplied config path', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-context7-mcp-'))
    const configPath = join(dir, 'config.toml')

    const result = ensureCodexContext7Mcp({
      options: { overwrite: false, dryRun: false },
      configPath,
    })

    expect(result).toEqual({ targetPath: configPath, action: 'created' })
    expect(readFileSync(configPath, 'utf8')).toContain('[mcp_servers.context7]')
  })

  it('is idempotent when the desired server block is already present', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-context7-mcp-'))
    const configPath = join(dir, 'config.toml')
    ensureCodexContext7Mcp({ options: { overwrite: false, dryRun: false }, configPath })

    const result = ensureCodexContext7Mcp({
      options: { overwrite: false, dryRun: false },
      configPath,
    })

    expect(result).toEqual({ targetPath: configPath, action: 'identical' })
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

describe('upsertClaudeContext7McpServer', () => {
  it('appends the hosted HTTP server with env-expanded headers', () => {
    const next = JSON.parse(
      upsertClaudeContext7McpServer(
        JSON.stringify({ project: 'demo', mcpServers: { playwright: { command: 'vp' } } }),
      ),
    ) as {
      project: string
      mcpServers: Record<string, unknown>
    }

    expect(next.project).toBe('demo')
    expect(next.mcpServers.playwright).toStrictEqual({ command: 'vp' })
    expect(next.mcpServers.context7).toStrictEqual({
      type: 'http',
      url: CONTEXT7_MCP_URL,
      headers: { CONTEXT7_API_KEY: CLAUDE_CONTEXT7_API_KEY_REF },
    })
  })

  it('replaces raw Claude Context7 headers while preserving other servers', () => {
    const next = JSON.parse(
      upsertClaudeContext7McpServer(
        JSON.stringify({
          mcpServers: {
            context7: {
              type: 'http',
              url: 'https://old.example/mcp',
              headers: { CONTEXT7_API_KEY: 'leaked-secret' },
            },
            exa: { command: 'exa' },
          },
        }),
      ),
    ) as { mcpServers: Record<string, unknown> }

    expect(JSON.stringify(next)).not.toContain('leaked-secret')
    expect(next.mcpServers.exa).toStrictEqual({ command: 'exa' })
    expect(next.mcpServers.context7).toStrictEqual({
      type: 'http',
      url: CONTEXT7_MCP_URL,
      headers: { CONTEXT7_API_KEY: CLAUDE_CONTEXT7_API_KEY_REF },
    })
  })

  it('is idempotent once the desired server exists', () => {
    const next = upsertClaudeContext7McpServer('')
    expect(upsertClaudeContext7McpServer(next)).toBe(next)
  })
})

describe('ensureClaudeContext7Mcp', () => {
  let dir: string | null = null

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('writes a missing .mcp.json under the repo root', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-claude-context7-mcp-'))
    const configPath = join(dir, '.mcp.json')

    const result = ensureClaudeContext7Mcp({
      options: { overwrite: false, dryRun: false },
      repoRoot: dir,
    })

    expect(result).toStrictEqual({ kind: 'claude-context7-mcp-written', path: configPath })
    const written = JSON.parse(readFileSync(configPath, 'utf8')) as {
      mcpServers: Record<string, { url?: string }>
    }
    expect(written.mcpServers.context7.url).toBe(CONTEXT7_MCP_URL)
  })

  it('is idempotent when the desired server is already present', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-claude-context7-mcp-'))
    const configPath = join(dir, '.mcp.json')
    ensureClaudeContext7Mcp({ options: { overwrite: false, dryRun: false }, repoRoot: dir })

    const result = ensureClaudeContext7Mcp({
      options: { overwrite: false, dryRun: false },
      repoRoot: dir,
    })

    expect(result).toStrictEqual({ kind: 'claude-context7-mcp-unchanged', path: configPath })
  })

  it('leaves an invalid-JSON .mcp.json untouched and reports it', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-claude-context7-mcp-'))
    const configPath = join(dir, '.mcp.json')
    writeFileSync(configPath, 'not json {', 'utf8')

    const result = ensureClaudeContext7Mcp({
      options: { overwrite: false, dryRun: false },
      repoRoot: dir,
    })

    expect(result).toStrictEqual({ kind: 'claude-context7-mcp-invalid-json', path: configPath })
    expect(readFileSync(configPath, 'utf8')).toBe('not json {')
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
  const entry = join(root, 'bin', process.platform === 'win32' ? 'wp.cmd' : 'wp')
  mkdirSync(join(root, 'bin'), { recursive: true })
  writeFileSync(entry, '#!/usr/bin/env node\n', 'utf8')
  return entry
}

describe('findWebpressoMcpEntry', () => {
  let dir: string | null = null

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('returns the first candidate that contains bin/wp', () => {
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
  it('renders absolute bin/wp + mcp args in the block', () => {
    const block = agentKitMcpBlock('/abs/path/bin/wp')
    expect(block).toContain(WEBPRESSO_MCP_HEADER)
    expect(block).toContain('command = "/abs/path/bin/wp"')
    expect(block).toContain('args = ["mcp"]')
    expect(block).toContain('enabled = true')
  })

  it('appends to an empty config', () => {
    const next = upsertWebpressoMcpServer('', '/abs/path/bin/wp')
    expect(next).toContain(WEBPRESSO_MCP_HEADER)
    expect(next).toContain('command = "/abs/path/bin/wp"')
    expect(next).toContain('args = ["mcp"]')
  })

  it('replaces an existing webpresso block without touching following tables', () => {
    const next = upsertWebpressoMcpServer(
      `[mcp_servers.webpresso]
command = "old"
args = ["old"]

[mcp_servers.playwright]
command = "vp"
`,
      '/new/path/bin/wp',
    )

    expect(next).toContain('command = "/new/path/bin/wp"')
    expect(next).toContain('args = ["mcp"]')
    expect(next).not.toContain('command = "old"')
    expect(next).toContain('[mcp_servers.playwright]\ncommand = "vp"')
    expect(next.match(/\[mcp_servers\.webpresso\]/g)).toHaveLength(1)
  })

  it('coexists with the playwright block when both upserts run on the same config', () => {
    const withPlaywright = upsertPlaywrightMcpServer('model = "gpt-5.4"\n')
    const withBoth = upsertWebpressoMcpServer(withPlaywright, '/abs/bin/wp')

    expect(withBoth).toContain(PLAYWRIGHT_MCP_HEADER)
    expect(withBoth).toContain(WEBPRESSO_MCP_HEADER)
    expect(withBoth.match(/\[mcp_servers\.playwright\]/g)).toHaveLength(1)
    expect(withBoth.match(/\[mcp_servers\.webpresso\]/g)).toHaveLength(1)
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
    expect(readFileSync(configPath, 'utf8')).toContain(`command = "${entryPath}"`)
    expect(readFileSync(configPath, 'utf8')).toContain('args = ["mcp"]')
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
