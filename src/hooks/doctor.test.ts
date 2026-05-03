import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'

vi.mock('node:fs')
vi.mock('node:os', () => ({ platform: () => 'linux' }))
vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

import { spawn } from 'node:child_process'
import { accessSync, readFileSync, statSync } from 'node:fs'

const mockSpawn = vi.mocked(spawn)
const mockAccessSync = vi.mocked(accessSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockStatSync = vi.mocked(statSync)

describe('hooks/doctor', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('AK_DOCTOR_MCP_TIMEOUT_MS', '1000')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const fakeProcess = (overrides: Partial<typeof process> = {}) => ({
    ...process,
    platform: 'linux' as typeof process.platform,
    ppid: 1234,
    pid: 5678,
    ...overrides,
  })

  const repoRoot = '/Users/ozby/repos/webpresso/agent-kit'
  const pkgJson = join(repoRoot, 'package.json')
  const pluginJson = join(repoRoot, '.claude-plugin', 'plugin.json')
  const builtMcpCli = join(repoRoot, 'dist/esm/mcp/cli.js')

  function mockHealthyHookProbe(): void {
    mockSpawn.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter
        stderr: EventEmitter
        stdin: { write: (chunk: string, cb?: () => void) => void; end: () => void }
        kill: () => boolean
      }
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.stdin = {
        write: (_chunk: string, cb?: () => void) => {
          cb?.()
        },
        end: () => {},
      }
      child.kill = () => true

      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from('{}'))
        child.emit('close', 0)
      })

      return child as unknown as ReturnType<typeof spawn>
    })
  }

  describe('runHooksDoctor', () => {
    it('returns false when no bins are found', async () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })
      vi.stubGlobal('process', fakeProcess())

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor()
      expect(result.ok).toBe(false)
    })

    it('skips executable check on win32', async () => {
      vi.mock('node:os', () => ({ platform: () => 'win32' }))

      mockAccessSync.mockImplementation((() => true) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o644 } as unknown as ReturnType<typeof statSync>)

      vi.stubGlobal('process', { ...fakeProcess(), platform: 'win32' })

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })
      const pretoolCheck = result.checks.find((c) => c.name === 'pretool-guard')
      expect(pretoolCheck?.detail).not.toContain('not executable')
    })

    it('skips MCP check when skipMcp is true', async () => {
      mockAccessSync.mockImplementation((() => true) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)

      vi.stubGlobal('process', fakeProcess())

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })
      const mcpCheck = result.checks.find((c) => c.name === 'MCP server liveness')
      expect(mcpCheck?.ok).toBe(true)
      expect(mcpCheck?.detail).toContain('skipped')
    })

    it('accepts plugin.json hooks/mcp path references relative to package root', async () => {
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        join(repoRoot, 'src/hooks/pretool-guard/index.ts'),
        join(repoRoot, 'src/hooks/post-tool/lint-after-edit.ts'),
        join(repoRoot, 'src/hooks/stop/qa-changed-files.ts'),
        join(repoRoot, 'src/hooks/guard-switch/index.ts'),
        join(repoRoot, 'src/hooks/sessionstart/index.ts'),
        join(repoRoot, 'src/hooks/test-quality-check.ts'),
        join(repoRoot, 'src/cli/cli.ts'),
      ])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) {
          return JSON.stringify({
            bin: {
              ak: './src/cli/cli.ts',
              'ak-pretool-guard': './src/hooks/pretool-guard/index.ts',
              'ak-post-tool': './src/hooks/post-tool/lint-after-edit.ts',
              'ak-stop-qa': './src/hooks/stop/qa-changed-files.ts',
              'ak-guard-switch': './src/hooks/guard-switch/index.ts',
              'ak-sessionstart-routing': './src/hooks/sessionstart/index.ts',
              'ak-test-quality-check': './src/hooks/test-quality-check.ts',
            },
          })
        }
        if (String(path) === pluginJson) {
          return JSON.stringify({
            version: '0.1.0',
            hooks: {
              PreToolUse: [{ hooks: [{ command: 'bun ${CLAUDE_PLUGIN_ROOT}/src/hooks/pretool-guard/index.ts' }] }],
            },
            mcpServers: {
              'agent-kit': { args: ['${CLAUDE_PLUGIN_ROOT}/src/cli/cli.ts'] },
            },
          })
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)
      mockHealthyHookProbe()

      vi.stubGlobal('process', fakeProcess())

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })
      expect(result.ok).toBe(true)
      expect(result.checks.find((c) => c.name === 'plugin.json integrity')?.ok).toBe(true)
    })

    it('prefers the built MCP CLI and initializes before tools/list', async () => {
      const writesByCommand = new Map<string, string[]>()
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        builtMcpCli,
        join(repoRoot, 'src/hooks/pretool-guard/index.ts'),
        join(repoRoot, 'src/hooks/post-tool/lint-after-edit.ts'),
        join(repoRoot, 'src/hooks/stop/qa-changed-files.ts'),
        join(repoRoot, 'src/hooks/guard-switch/index.ts'),
        join(repoRoot, 'src/hooks/sessionstart/index.ts'),
        join(repoRoot, 'src/hooks/test-quality-check.ts'),
        join(repoRoot, 'src/cli/cli.ts'),
      ])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) {
          return JSON.stringify({
            bin: {
              ak: './src/cli/cli.ts',
              'ak-pretool-guard': './src/hooks/pretool-guard/index.ts',
              'ak-post-tool': './src/hooks/post-tool/lint-after-edit.ts',
              'ak-stop-qa': './src/hooks/stop/qa-changed-files.ts',
              'ak-guard-switch': './src/hooks/guard-switch/index.ts',
              'ak-sessionstart-routing': './src/hooks/sessionstart/index.ts',
              'ak-test-quality-check': './src/hooks/test-quality-check.ts',
            },
          })
        }
        if (String(path) === pluginJson) {
          return JSON.stringify({ version: '0.1.0', hooks: {}, mcpServers: {} })
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)
      mockSpawn.mockImplementation((command, args) => {
        const child = new EventEmitter() as EventEmitter & {
          stdout: EventEmitter
          stderr: EventEmitter
          stdin: { write: (chunk: string, cb?: () => void) => void; end: () => void }
          kill: () => boolean
        }
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()

        const key = `${String(command)} ${(args ?? []).join(' ')}`
        const writes: string[] = []
        writesByCommand.set(key, writes)

        child.stdin = {
          write: (chunk: string, cb?: () => void) => {
            writes.push(chunk)
            const isMcpProbe = command === 'node' && args?.[0] === builtMcpCli
            if (isMcpProbe && writes.length === 2) {
              queueMicrotask(() => {
                child.stdout.emit('data', Buffer.from('{"jsonrpc":"2.0","id":1,"result":{"capabilities":{"tools":{}}}}\n'))
                child.stdout.emit('data', Buffer.from('{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"ak_test"}]}}\n'))
              })
            }
            cb?.()
          },
          end: () => {
            queueMicrotask(() => {
              if (!(command === 'node' && args?.[0] === builtMcpCli)) {
                child.stdout.emit('data', Buffer.from('{}'))
              }
              child.emit('close', 0)
            })
          },
        }
        child.kill = () => {
          queueMicrotask(() => child.emit('close', null))
          return true
        }

        return child as unknown as ReturnType<typeof spawn>
      })

      vi.stubGlobal('process', fakeProcess({ execPath: '/mock/bin/bun' }))

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor()

      expect(result.ok).toBe(true)
      const mcpKey = 'node /Users/ozby/repos/webpresso/agent-kit/dist/esm/mcp/cli.js'
      expect(writesByCommand.get(mcpKey)).toEqual([
        '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"agent-kit-hooks-doctor","version":"0.0.0"}}}\n',
        '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n',
      ])
      expect(result.checks.find((c) => c.name === 'MCP server liveness')?.detail).toContain('responded with 1 tools')
    })
  })
})
