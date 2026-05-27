import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

vi.mock('node:fs')
vi.mock('node:os', () => ({ platform: () => 'linux' }))
vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

import { spawn } from 'node:child_process'
import { accessSync, existsSync, readFileSync, readlinkSync, statSync } from 'node:fs'

const mockSpawn = vi.mocked(spawn)
const mockAccessSync = vi.mocked(accessSync)
const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockReadlinkSync = vi.mocked(readlinkSync)
const mockStatSync = vi.mocked(statSync)

describe('hooks/doctor', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('WP_DOCTOR_MCP_TIMEOUT_MS', '1000')
    mockExistsSync.mockReturnValue(false)
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

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const pkgJson = join(repoRoot, 'package.json')
  const pluginJson = join(repoRoot, '.claude-plugin', 'plugin.json')
  const builtMcpCli = join(repoRoot, 'dist/esm/mcp/cli.js')
  const rtkMarker = join(repoRoot, '.agent', '.rtk-requested')
  const devLinkState = join(repoRoot, '.webpresso', 'webpresso-dev-link.json')

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

    it('finds the owning package root instead of stopping at dist/esm/package.json', async () => {
      const distPackage = join(repoRoot, 'dist', 'esm', 'package.json')
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        distPackage,
      ])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === distPackage) {
          return JSON.stringify({ type: 'module' })
        }
        if (String(path) === pkgJson) {
          return JSON.stringify({
            bin: {
              wp: './bin/wp.js',
            },
          })
        }
        if (String(path) === pluginJson) {
          return JSON.stringify({ version: '0.1.0', hooks: {}, mcpServers: {} })
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)

      const { findOwningPackageRoot } = await import('#hooks/doctor')
      const resolved = findOwningPackageRoot(join(repoRoot, 'dist', 'esm', 'hooks'))
      expect(resolved).toBe(repoRoot)
    })

    it('skips executable check on win32', async () => {
      // `node:os` is mocked at the top level of the file (linux). For this
      // test the win32 branch is gated by `process.platform`, set via the
      // stubGlobal call below — no per-test re-mock of `node:os` needed
      // (and vitest 4 deprecates nested vi.mock anyway, since it gets
      // hoisted to module top regardless of where it appears).
      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        return true
      }) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o644 } as unknown as ReturnType<typeof statSync>)

      vi.stubGlobal('process', { ...fakeProcess(), platform: 'win32' })

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })
      const pretoolCheck = result.checks.find((c) => c.name === 'pretool-guard')
      expect(pretoolCheck?.detail).not.toContain('not executable')
    })

    it('skips MCP check when skipMcp is true', async () => {
      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        return true
      }) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)

      vi.stubGlobal('process', fakeProcess())

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })
      const mcpCheck = result.checks.find((c) => c.name === 'MCP server liveness')
      expect(mcpCheck?.ok).toBe(true)
      expect(mcpCheck?.detail).toContain('skipped')
    })

    it('reports hook probe stdin EPIPE instead of throwing an unhandled error', async () => {
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        join(repoRoot, 'src/hooks/pretool-guard/index.ts'),
        join(repoRoot, 'src/hooks/post-tool/lint-after-edit.ts'),
        join(repoRoot, 'src/hooks/stop/qa-changed-files.ts'),
        join(repoRoot, 'src/hooks/guard-switch/index.ts'),
        join(repoRoot, 'src/hooks/sessionstart/index.ts'),
        join(repoRoot, 'src/hooks/test-quality-check.ts'),
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
              'wp-pretool-guard': './src/hooks/pretool-guard/index.ts',
              'wp-post-tool': './src/hooks/post-tool/lint-after-edit.ts',
              'wp-stop-qa': './src/hooks/stop/qa-changed-files.ts',
              'wp-guard-switch': './src/hooks/guard-switch/index.ts',
              'wp-sessionstart-routing': './src/hooks/sessionstart/index.ts',
              'wp-test-quality-check': './src/hooks/test-quality-check.ts',
            },
          })
        }
        if (String(path) === pluginJson)
          return JSON.stringify({ version: '0.1.0', hooks: {}, mcpServers: {} })
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)
      mockSpawn.mockImplementation(() => {
        const child = new EventEmitter() as EventEmitter & {
          stdout: EventEmitter
          stderr: EventEmitter
          stdin: EventEmitter & { write: (chunk: string, cb?: () => void) => void; end: () => void }
          kill: () => boolean
        }
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.stdin = new EventEmitter() as EventEmitter & {
          write: (chunk: string, cb?: () => void) => void
          end: () => void
        }
        child.stdin.write = () => {
          queueMicrotask(() => {
            const error = new Error('write EPIPE') as NodeJS.ErrnoException
            error.code = 'EPIPE'
            child.stdin.emit('error', error)
            child.emit('close', 1)
          })
        }
        child.stdin.end = () => {
          queueMicrotask(() => child.emit('close', 0))
        }
        child.kill = () => true
        return child as unknown as ReturnType<typeof spawn>
      })

      vi.stubGlobal('process', fakeProcess())

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })
      expect(result.ok).toBe(false)
      expect(result.checks.find((check) => check.name === 'pretool-guard')?.detail).toBe(
        'stdin write failed: write EPIPE',
      )
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
              'wp-pretool-guard': './src/hooks/pretool-guard/index.ts',
              'wp-post-tool': './src/hooks/post-tool/lint-after-edit.ts',
              'wp-stop-qa': './src/hooks/stop/qa-changed-files.ts',
              'wp-guard-switch': './src/hooks/guard-switch/index.ts',
              'wp-sessionstart-routing': './src/hooks/sessionstart/index.ts',
              'wp-test-quality-check': './src/hooks/test-quality-check.ts',
            },
          })
        }
        if (String(path) === pluginJson) {
          return JSON.stringify({
            version: '0.1.0',
            hooks: {
              PreToolUse: [
                {
                  hooks: [
                    { command: 'bun ${CLAUDE_PLUGIN_ROOT}/src/hooks/pretool-guard/index.ts' },
                  ],
                },
              ],
            },
            mcpServers: {
              webpresso: { args: ['${CLAUDE_PLUGIN_ROOT}/src/cli/cli.ts'] },
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
              'wp-pretool-guard': './src/hooks/pretool-guard/index.ts',
              'wp-post-tool': './src/hooks/post-tool/lint-after-edit.ts',
              'wp-stop-qa': './src/hooks/stop/qa-changed-files.ts',
              'wp-guard-switch': './src/hooks/guard-switch/index.ts',
              'wp-sessionstart-routing': './src/hooks/sessionstart/index.ts',
              'wp-test-quality-check': './src/hooks/test-quality-check.ts',
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
                child.stdout.emit(
                  'data',
                  Buffer.from('{"jsonrpc":"2.0","id":1,"result":{"capabilities":{"tools":{}}}}\n'),
                )
                child.stdout.emit(
                  'data',
                  Buffer.from('{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"wp_test"}]}}\n'),
                )
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
      const mcpKey = `node ${builtMcpCli}`
      expect(writesByCommand.get(mcpKey)).toEqual([
        '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"webpresso-hooks-doctor","version":"0.0.0"}}}\n',
        '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n',
      ])
      expect(result.checks.find((c) => c.name === 'MCP server liveness')?.detail).toContain(
        'responded with 1 tools',
      )
    })

    it('adds a green rtk row when requested and present', async () => {
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        rtkMarker,
        join(repoRoot, 'src/hooks/pretool-guard/index.ts'),
        join(repoRoot, 'src/hooks/post-tool/lint-after-edit.ts'),
        join(repoRoot, 'src/hooks/stop/qa-changed-files.ts'),
        join(repoRoot, 'src/hooks/guard-switch/index.ts'),
        join(repoRoot, 'src/hooks/sessionstart/index.ts'),
        join(repoRoot, 'src/hooks/test-quality-check.ts'),
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
              'wp-pretool-guard': './src/hooks/pretool-guard/index.ts',
              'wp-post-tool': './src/hooks/post-tool/lint-after-edit.ts',
              'wp-stop-qa': './src/hooks/stop/qa-changed-files.ts',
              'wp-guard-switch': './src/hooks/guard-switch/index.ts',
              'wp-sessionstart-routing': './src/hooks/sessionstart/index.ts',
              'wp-test-quality-check': './src/hooks/test-quality-check.ts',
            },
          })
        }
        if (String(path) === pluginJson)
          return JSON.stringify({ version: '0.1.0', hooks: {}, mcpServers: {} })
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
        child.stdin = {
          write: (_chunk: string, cb?: () => void) => cb?.(),
          end: () => {
            queueMicrotask(() => {
              if (!(command === 'rtk' && args?.[0] === '--version')) {
                child.stdout.emit('data', Buffer.from('{}'))
              }
              if (!(command === 'rtk' && args?.[0] === '--version')) child.emit('close', 0)
            })
          },
        }
        child.kill = () => true
        if (command === 'rtk' && args?.[0] === '--version') {
          queueMicrotask(() => {
            child.stdout.emit('data', Buffer.from('rtk 1.2.3'))
            child.emit('close', 0)
          })
        }
        return child as unknown as ReturnType<typeof spawn>
      })

      vi.stubGlobal('process', fakeProcess({ cwd: () => repoRoot }))

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })
      expect(result.checks.find((c) => c.name === 'rtk on PATH')).toEqual({
        name: 'rtk on PATH',
        ok: true,
        detail: 'rtk 1.2.3',
      })
    })

    it('adds a red rtk row when requested but missing', async () => {
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        rtkMarker,
        join(repoRoot, 'src/hooks/pretool-guard/index.ts'),
        join(repoRoot, 'src/hooks/post-tool/lint-after-edit.ts'),
        join(repoRoot, 'src/hooks/stop/qa-changed-files.ts'),
        join(repoRoot, 'src/hooks/guard-switch/index.ts'),
        join(repoRoot, 'src/hooks/sessionstart/index.ts'),
        join(repoRoot, 'src/hooks/test-quality-check.ts'),
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
              'wp-pretool-guard': './src/hooks/pretool-guard/index.ts',
              'wp-post-tool': './src/hooks/post-tool/lint-after-edit.ts',
              'wp-stop-qa': './src/hooks/stop/qa-changed-files.ts',
              'wp-guard-switch': './src/hooks/guard-switch/index.ts',
              'wp-sessionstart-routing': './src/hooks/sessionstart/index.ts',
              'wp-test-quality-check': './src/hooks/test-quality-check.ts',
            },
          })
        }
        if (String(path) === pluginJson)
          return JSON.stringify({ version: '0.1.0', hooks: {}, mcpServers: {} })
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
        child.stdin = {
          write: (_chunk: string, cb?: () => void) => cb?.(),
          end: () => {
            queueMicrotask(() => {
              if (!(command === 'rtk' && args?.[0] === '--version')) {
                child.stdout.emit('data', Buffer.from('{}'))
                child.emit('close', 0)
              }
            })
          },
        }
        child.kill = () => true
        if (command === 'rtk' && args?.[0] === '--version') {
          queueMicrotask(() => {
            child.emit('error', new Error('ENOENT'))
          })
        }
        return child as unknown as ReturnType<typeof spawn>
      })

      vi.stubGlobal('process', fakeProcess({ cwd: () => repoRoot }))

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })
      expect(result.ok).toBe(false)
      expect(result.checks.find((c) => c.name === 'rtk on PATH')?.detail).toContain(
        'brew install rtk',
      )
    })

    it('omits the rtk row when the repo did not request rtk', async () => {
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        join(repoRoot, 'src/hooks/pretool-guard/index.ts'),
        join(repoRoot, 'src/hooks/post-tool/lint-after-edit.ts'),
        join(repoRoot, 'src/hooks/stop/qa-changed-files.ts'),
        join(repoRoot, 'src/hooks/guard-switch/index.ts'),
        join(repoRoot, 'src/hooks/sessionstart/index.ts'),
        join(repoRoot, 'src/hooks/test-quality-check.ts'),
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
              'wp-pretool-guard': './src/hooks/pretool-guard/index.ts',
              'wp-post-tool': './src/hooks/post-tool/lint-after-edit.ts',
              'wp-stop-qa': './src/hooks/stop/qa-changed-files.ts',
              'wp-guard-switch': './src/hooks/guard-switch/index.ts',
              'wp-sessionstart-routing': './src/hooks/sessionstart/index.ts',
              'wp-test-quality-check': './src/hooks/test-quality-check.ts',
            },
          })
        }
        if (String(path) === pluginJson)
          return JSON.stringify({ version: '0.1.0', hooks: {}, mcpServers: {} })
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)
      mockHealthyHookProbe()

      vi.stubGlobal('process', fakeProcess({ cwd: () => repoRoot }))

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })
      expect(result.checks.find((c) => c.name === 'rtk on PATH')).toBeUndefined()
    })

    it('reports installed Codex/OpenCode/Claude host integrations as healthy when the expected surfaces are visible', async () => {
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        join(repoRoot, 'src/hooks/pretool-guard/index.ts'),
        join(repoRoot, 'src/hooks/post-tool/lint-after-edit.ts'),
        join(repoRoot, 'src/hooks/stop/qa-changed-files.ts'),
        join(repoRoot, 'src/hooks/guard-switch/index.ts'),
        join(repoRoot, 'src/hooks/sessionstart/index.ts'),
        join(repoRoot, 'src/hooks/test-quality-check.ts'),
      ])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockExistsSync.mockImplementation((path) => knownPaths.has(String(path)))
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) {
          return JSON.stringify({
            bin: {
              'wp-pretool-guard': './src/hooks/pretool-guard/index.ts',
              'wp-post-tool': './src/hooks/post-tool/lint-after-edit.ts',
              'wp-stop-qa': './src/hooks/stop/qa-changed-files.ts',
              'wp-guard-switch': './src/hooks/guard-switch/index.ts',
              'wp-sessionstart-routing': './src/hooks/sessionstart/index.ts',
              'wp-test-quality-check': './src/hooks/test-quality-check.ts',
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
        const finish = () => {
          queueMicrotask(() => {
            if (command === 'codex' && args?.[0] === 'mcp') {
              child.stdout.emit('data', Buffer.from('✓ webpresso\n✓ context-mode\n'))
            } else if (command === 'opencode' && args?.[0] === 'mcp') {
              child.stdout.emit('data', Buffer.from('✓ webpresso\n✓ context-mode\n'))
            } else if (command === 'claude' && args?.[0] === 'plugin') {
              child.stdout.emit('data', Buffer.from('ok\n'))
            } else {
              child.stdout.emit('data', Buffer.from('{}'))
            }
            child.emit('close', 0)
          })
        }
        child.stdin = {
          write: (_chunk: string, cb?: () => void) => cb?.(),
          end: finish,
        }
        if (command === 'codex' || command === 'opencode' || command === 'claude') finish()
        child.kill = () => true
        return child as unknown as ReturnType<typeof spawn>
      })

      vi.stubEnv('WP_RUN_HOST_SMOKE', '1')
      vi.stubGlobal('process', fakeProcess({ cwd: () => repoRoot }))

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true, hosts: 'auto' })
      expect(result.checks.find((c) => c.name === 'Codex host integration')?.ok).toBe(true)
      expect(result.checks.find((c) => c.name === 'OpenCode host integration')?.ok).toBe(true)
      expect(result.checks.find((c) => c.name === 'Claude host integration')?.ok).toBe(true)
    })

    it('fails when an installed host is missing required MCP entries', async () => {
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        join(repoRoot, 'src/hooks/pretool-guard/index.ts'),
        join(repoRoot, 'src/hooks/post-tool/lint-after-edit.ts'),
        join(repoRoot, 'src/hooks/stop/qa-changed-files.ts'),
        join(repoRoot, 'src/hooks/guard-switch/index.ts'),
        join(repoRoot, 'src/hooks/sessionstart/index.ts'),
        join(repoRoot, 'src/hooks/test-quality-check.ts'),
      ])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) {
          return JSON.stringify({
            bin: {
              'wp-pretool-guard': './src/hooks/pretool-guard/index.ts',
              'wp-post-tool': './src/hooks/post-tool/lint-after-edit.ts',
              'wp-stop-qa': './src/hooks/stop/qa-changed-files.ts',
              'wp-guard-switch': './src/hooks/guard-switch/index.ts',
              'wp-sessionstart-routing': './src/hooks/sessionstart/index.ts',
              'wp-test-quality-check': './src/hooks/test-quality-check.ts',
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
        const finish = () => {
          queueMicrotask(() => {
            if (command === 'opencode' && args?.[0] === 'mcp') {
              child.stdout.emit('data', Buffer.from('✗ webpresso\n✓ context-mode\n'))
            } else {
              child.stdout.emit('data', Buffer.from('{}'))
            }
            child.emit('close', 0)
          })
        }
        child.stdin = {
          write: (_chunk: string, cb?: () => void) => cb?.(),
          end: finish,
        }
        if (command === 'opencode') finish()
        child.kill = () => true
        return child as unknown as ReturnType<typeof spawn>
      })

      vi.stubEnv('WP_RUN_HOST_SMOKE', '1')
      vi.stubGlobal('process', fakeProcess({ cwd: () => repoRoot }))

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true, hosts: 'auto', hostNames: ['opencode'] })
      expect(result.ok).toBe(false)
      expect(result.checks.find((c) => c.name === 'OpenCode host integration')?.detail).toContain(
        'MCP not connected',
      )
    })

    it('adds a green live-source dev-link row when the consumer link is healthy', async () => {
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        devLinkState,
        join(repoRoot, 'src/hooks/pretool-guard/index.ts'),
        join(repoRoot, 'src/hooks/post-tool/lint-after-edit.ts'),
        join(repoRoot, 'src/hooks/stop/qa-changed-files.ts'),
        join(repoRoot, 'src/hooks/guard-switch/index.ts'),
        join(repoRoot, 'src/hooks/sessionstart/index.ts'),
        join(repoRoot, 'src/hooks/test-quality-check.ts'),
        join(repoRoot, 'node_modules', 'webpresso'),
        join('/live/webpresso', 'package.json'),
      ])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) {
          return JSON.stringify({
            bin: {
              'wp-pretool-guard': './src/hooks/pretool-guard/index.ts',
              'wp-post-tool': './src/hooks/post-tool/lint-after-edit.ts',
              'wp-stop-qa': './src/hooks/stop/qa-changed-files.ts',
              'wp-guard-switch': './src/hooks/guard-switch/index.ts',
              'wp-sessionstart-routing': './src/hooks/sessionstart/index.ts',
              'wp-test-quality-check': './src/hooks/test-quality-check.ts',
            },
          })
        }
        if (String(path) === pluginJson) {
          return JSON.stringify({ version: '0.1.0', hooks: {}, mcpServers: {} })
        }
        if (String(path) === devLinkState) {
          return JSON.stringify({ package: 'webpresso', linkedFrom: '/live/webpresso' })
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)
      mockReadlinkSync.mockReturnValue('/live/webpresso')
      mockHealthyHookProbe()

      vi.stubGlobal('process', fakeProcess({ cwd: () => repoRoot }))

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true, cwd: repoRoot })
      expect(result.checks.find((check) => check.name === 'live-source dev-link')).toEqual({
        name: 'live-source dev-link',
        ok: true,
        detail: 'webpresso → /live/webpresso',
      })
    })

    it('adds a red live-source dev-link row when the linked source checkout is missing', async () => {
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        devLinkState,
        join(repoRoot, 'src/hooks/pretool-guard/index.ts'),
        join(repoRoot, 'src/hooks/post-tool/lint-after-edit.ts'),
        join(repoRoot, 'src/hooks/stop/qa-changed-files.ts'),
        join(repoRoot, 'src/hooks/guard-switch/index.ts'),
        join(repoRoot, 'src/hooks/sessionstart/index.ts'),
        join(repoRoot, 'src/hooks/test-quality-check.ts'),
      ])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockExistsSync.mockImplementation((path) => knownPaths.has(String(path)))
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) {
          return JSON.stringify({
            bin: {
              'wp-pretool-guard': './src/hooks/pretool-guard/index.ts',
              'wp-post-tool': './src/hooks/post-tool/lint-after-edit.ts',
              'wp-stop-qa': './src/hooks/stop/qa-changed-files.ts',
              'wp-guard-switch': './src/hooks/guard-switch/index.ts',
              'wp-sessionstart-routing': './src/hooks/sessionstart/index.ts',
              'wp-test-quality-check': './src/hooks/test-quality-check.ts',
            },
          })
        }
        if (String(path) === pluginJson) {
          return JSON.stringify({ version: '0.1.0', hooks: {}, mcpServers: {} })
        }
        if (String(path) === devLinkState) {
          return JSON.stringify({ package: 'webpresso', linkedFrom: '/missing/webpresso' })
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)
      mockHealthyHookProbe()

      vi.stubGlobal('process', fakeProcess({ cwd: () => repoRoot }))

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true, cwd: repoRoot })
      expect(result.ok).toBe(false)
      expect(
        result.checks.find((check) => check.name === 'live-source dev-link')?.detail,
      ).toContain('vp run dev:link --consumer')
    })
  })
})
