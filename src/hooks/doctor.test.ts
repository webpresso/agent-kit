import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

vi.mock('node:fs')
vi.mock('node:os', () => ({ platform: () => 'linux' }))
vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
const parityProbeMock = vi.hoisted(() => vi.fn())
vi.mock('#typecheck/runtime-parity.js', () => ({
  formatRuntimeTypecheckParityFailures: (result: { failures: readonly string[] }) =>
    result.failures.join('; '),
  probeRuntimeTypecheckParity: parityProbeMock,
}))

import { spawn } from 'node:child_process'
import { accessSync, existsSync, lstatSync, readFileSync, statSync } from 'node:fs'

const mockSpawn = vi.mocked(spawn)
const mockAccessSync = vi.mocked(accessSync)
const mockExistsSync = vi.mocked(existsSync)
const mockLstatSync = vi.mocked(lstatSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockStatSync = vi.mocked(statSync)

describe('hooks/doctor', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('WP_DOCTOR_MCP_TIMEOUT_MS', '1000')
    parityProbeMock.mockReturnValue({
      ok: true,
      failures: [],
      helpOutput: '',
      fileOutput: '',
      expectedScopes: ['@parity/root', '@parity/widget'],
      workspaceRoot: '/tmp/parity-fixture',
    })
    mockExistsSync.mockImplementation(((path: Parameters<typeof existsSync>[0]) => {
      try {
        mockAccessSync(path)
        return true
      } catch {
        return false
      }
    }) as typeof existsSync)
    mockLstatSync.mockReturnValue({
      isSymbolicLink: () => false,
      isFile: () => true,
      mode: 0o100755,
    } as ReturnType<typeof lstatSync>)
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
  const distPkgJson = join(repoRoot, 'dist/esm', 'package.json')
  const pluginJson = join(repoRoot, '.claude-plugin', 'plugin.json')
  const codexPluginJson = join(repoRoot, '.codex-plugin', 'plugin.json')
  const codexPluginMcpJson = join(repoRoot, 'codex.mcp.json')
  const codexPluginHooksJson = join(repoRoot, 'hooks', 'hooks.json')
  const opencodePluginBridge = join(repoRoot, '.opencode', 'plugins', 'webpresso-hooks.js')
  const wpBin = join(repoRoot, 'bin', 'wp')
  const builtMcpCli = join(repoRoot, 'dist/esm/mcp/cli.js')
  const rtkMarker = join(repoRoot, '.agent', '.rtk-requested')

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

  // Decision-aware guard mock: empty-stdin liveness probes get `{}`; full
  // conformance payloads get a routing decision derived from the command
  // (`gh pr view` denies, everything else allows). `denyWrongly` inverts the
  // decision to simulate a broken guard so the probe must flag it.
  function mockDecisionAwareProbe(opts: { denyWrongly?: boolean } = {}): void {
    const DENY = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'Use wp_pr_status MCP tool instead',
      },
    })
    mockSpawn.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter
        stderr: EventEmitter
        stdin: { write: (chunk: string, cb?: () => void) => void; end: () => void; on?: () => void }
        kill: () => boolean
      }
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      let written = ''
      child.stdin = {
        on: () => {},
        write: (chunk: string, cb?: () => void) => {
          written += chunk
          cb?.()
        },
        end: () => {
          queueMicrotask(() => {
            let command = ''
            try {
              command =
                (JSON.parse(written.trim()) as { tool_input?: { command?: string } })?.tool_input
                  ?.command ?? ''
            } catch {
              command = ''
            }
            if (command.length === 0) {
              child.stdout.emit('data', Buffer.from('{}'))
              child.emit('close', 0)
              return
            }
            const shouldDeny = command.includes('gh pr view')
            const emitDeny = opts.denyWrongly ? !shouldDeny : shouldDeny
            child.stdout.emit('data', Buffer.from(emitDeny ? DENY : '{}'))
            child.emit('close', 0)
          })
        },
      }
      child.kill = () => true
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
      const knownPaths = new Set([pkgJson, pluginJson, distPackage])

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
              wp: './bin/wp',
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

    it('resolves the owning package root from the PATH launcher when moduleUrl is virtual', async () => {
      const stagedBin = join(repoRoot, 'bin', 'wp')
      const knownPaths = new Set([pkgJson, stagedBin])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) {
          return JSON.stringify({
            bin: {
              wp: './bin/wp',
            },
          })
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)

      const { resolvePackageRootForRuntime } = await import('#hooks/doctor')
      const resolved = resolvePackageRootForRuntime({
        moduleUrl: 'file:///__bunfs__/root/wp',
        execPath: '/usr/bin/node',
        argv0: 'wp',
        argv1: 'setup',
        pathEnv: join(repoRoot, 'bin'),
      })
      expect(resolved).toBe(repoRoot)
    })

    it('resolves the owning package root from a Windows PATH shim when moduleUrl is virtual', async () => {
      const stagedBin = join(repoRoot, 'bin', 'wp.cmd')
      const knownPaths = new Set([pkgJson, stagedBin])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) {
          return JSON.stringify({
            bin: {
              wp: './bin/wp',
            },
          })
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)

      const { resolvePackageRootForRuntime } = await import('#hooks/doctor')
      const resolved = resolvePackageRootForRuntime({
        moduleUrl: 'file:///__bunfs__/root/wp',
        execPath: 'C:\\Program Files\\nodejs\\node.exe',
        argv0: 'wp',
        argv1: 'setup',
        pathEnv: join(repoRoot, 'bin'),
        pathExtEnv: '.COM;.EXE;.BAT;.CMD',
        platform: 'win32',
      })
      expect(resolved).toBe(repoRoot)
    })

    it('does not report an executable error when the repo wp launcher is executable', async () => {
      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        return true
      }) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      mockHealthyHookProbe()

      vi.stubGlobal('process', fakeProcess())

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })
      const pretoolCheck = result.checks.find((c) => c.name === 'pretool-guard')
      expect(pretoolCheck?.detail).not.toBe('exists but not executable')
      expect(pretoolCheck?.ok).toBe(true)
    })

    it('does not run decision probes by default (cheap doctor)', async () => {
      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        return true
      }) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      mockDecisionAwareProbe()
      vi.stubGlobal('process', fakeProcess())

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })
      expect(result.checks.some((c) => c.name.startsWith('decision probe:'))).toBe(false)
    })

    it('passes decision probes when the guard routes allow/deny correctly', async () => {
      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        return true
      }) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      mockDecisionAwareProbe()
      vi.stubGlobal('process', fakeProcess())

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true, probeDecisions: true })
      const decisionChecks = result.checks.filter((c) => c.name.startsWith('decision probe:'))
      expect(decisionChecks.length).toBeGreaterThanOrEqual(2)
      expect(decisionChecks.every((c) => c.ok)).toBe(true)
      expect(decisionChecks.some((c) => c.name.includes('allow gh pr merge'))).toBe(true)
      expect(decisionChecks.some((c) => c.name.includes('deny gh pr view'))).toBe(true)
    })

    it('fails the decision probe when the guard returns the wrong decision', async () => {
      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        return true
      }) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      mockDecisionAwareProbe({ denyWrongly: true })
      vi.stubGlobal('process', fakeProcess())

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true, probeDecisions: true })
      const decisionChecks = result.checks.filter((c) => c.name.startsWith('decision probe:'))
      expect(decisionChecks.some((c) => !c.ok)).toBe(true)
      expect(result.ok).toBe(false)
    })

    it('skips MCP check when skipMcp is true', async () => {
      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        return true
      }) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      mockHealthyHookProbe()

      vi.stubGlobal('process', fakeProcess())

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })
      const mcpCheck = result.checks.find((c) => c.name === 'MCP server liveness')
      expect(mcpCheck?.ok).toBe(true)
      expect(mcpCheck?.detail).toContain('skipped')
    })

    it('fails a hung hook probe instead of hanging hooks doctor', async () => {
      vi.stubEnv('WP_DOCTOR_HOOK_TIMEOUT_MS', '5')
      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        return true
      }) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      const kills: string[] = []
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
        child.kill = () => {
          kills.push('killed')
          return true
        }
        return child as unknown as ReturnType<typeof spawn>
      })

      vi.stubGlobal('process', fakeProcess())

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true, hosts: 'skip' })
      const pretoolCheck = result.checks.find((c) => c.name === 'pretool-guard')

      expect(result.ok).toBe(false)
      expect(pretoolCheck?.detail).toBe('hook probe timed out after 5ms')
      expect(kills.length).toBeGreaterThan(0)
    })

    it('reports the managed PreCompact snapshot hook when skipMcp is true', async () => {
      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        return true
      }) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      mockHealthyHookProbe()

      vi.stubGlobal('process', fakeProcess())

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })
      const precompactCheck = result.checks.find((c) => c.name === 'precompact-snapshot')
      expect(precompactCheck).toEqual({
        name: 'precompact-snapshot',
        ok: true,
      })
      expect(result.checks.find((c) => c.name === 'MCP server liveness')?.detail).toContain(
        'skipped',
      )
    })

    it('reports the MCP-first operator flow and forbids wrapped wp scripts', async () => {
      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        return true
      }) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      mockHealthyHookProbe()

      vi.stubGlobal('process', fakeProcess())

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })
      const flowCheck = result.checks.find((c) => c.name === 'operator flow')
      expect(flowCheck?.ok).toBe(true)
      expect(flowCheck?.detail).toContain('MCP first')
      expect(flowCheck?.detail).toContain('direct `wp` only as fallback')
      expect(flowCheck?.detail).toContain('bun run wp')
    })

    it('records explicit phase2 runtime typecheck parity evidence for the native host runtime', async () => {
      const hostTargetId = `linux-${process.arch}`
      const runtimeManifestPath = join(repoRoot, 'bin', 'runtime-manifest.json')
      const stagedBinPath = join(repoRoot, 'bin', 'wp')
      const runtimeTargetPath = join(repoRoot, 'bin', 'runtime', hostTargetId, 'wp')
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        runtimeManifestPath,
        stagedBinPath,
        runtimeTargetPath,
      ])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) return JSON.stringify({ bin: { wp: './bin/wp' } })
        if (String(path) === pluginJson) {
          return JSON.stringify({
            version: '0.28.0',
            mcpServers: { webpresso: { command: '${CLAUDE_PLUGIN_ROOT}/bin/wp', args: ['mcp'] } },
          })
        }
        if (String(path) === runtimeManifestPath) {
          return JSON.stringify({
            binaryName: 'wp',
            targets: [
              {
                id: hostTargetId,
                os: 'linux',
                cpu: process.arch,
                packageName: `@webpresso/agent-kit-runtime-${hostTargetId}`,
              },
            ],
          })
        }
        if (String(path) === stagedBinPath) {
          return "#!/usr/bin/env node\n\nimport { runNamedBin } from './_run.js'\n\nrunNamedBin('wp')\n"
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      mockHealthyHookProbe()

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })

      expect(parityProbeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          command: runtimeTargetPath,
          env: expect.objectContaining({ WP_SKIP_UPDATE_CHECK: '1' }),
        }),
      )
      expect(result.checks.find((c) => c.name === 'phase2 runtime typecheck parity')).toEqual(
        expect.objectContaining({
          advisory: true,
          ok: true,
          detail: `host runtime ${hostTargetId} exposes --file/--package and resolved scopes`,
        }),
      )
    })

    it('surfaces a specific runtime parity mismatch when the native host runtime lags typecheck targeting', async () => {
      const hostTargetId = `linux-${process.arch}`
      const runtimeManifestPath = join(repoRoot, 'bin', 'runtime-manifest.json')
      const stagedBinPath = join(repoRoot, 'bin', 'wp')
      const runtimeTargetPath = join(repoRoot, 'bin', 'runtime', hostTargetId, 'wp')
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        runtimeManifestPath,
        stagedBinPath,
        runtimeTargetPath,
      ])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) return JSON.stringify({ bin: { wp: './bin/wp' } })
        if (String(path) === pluginJson) {
          return JSON.stringify({
            version: '0.28.0',
            mcpServers: { webpresso: { command: '${CLAUDE_PLUGIN_ROOT}/bin/wp', args: ['mcp'] } },
          })
        }
        if (String(path) === runtimeManifestPath) {
          return JSON.stringify({
            binaryName: 'wp',
            targets: [
              {
                id: hostTargetId,
                os: 'linux',
                cpu: process.arch,
                packageName: `@webpresso/agent-kit-runtime-${hostTargetId}`,
              },
            ],
          })
        }
        if (String(path) === stagedBinPath) {
          return "#!/usr/bin/env node\n\nimport { runNamedBin } from './_run.js'\n\nrunNamedBin('wp')\n"
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      mockHealthyHookProbe()
      parityProbeMock.mockReturnValue({
        ok: false,
        failures: ['typecheck --help is missing the --file flag'],
        helpOutput: 'Usage: wp typecheck',
        fileOutput: '',
        expectedScopes: ['@parity/root', '@parity/widget'],
        workspaceRoot: '/tmp/parity-fixture',
      })

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })

      expect(result.ok).toBe(true)
      expect(result.checks.find((c) => c.name === 'phase2 runtime typecheck parity')).toEqual(
        expect.objectContaining({
          advisory: true,
          ok: false,
          detail: 'runtime surface mismatch: typecheck --help is missing the --file flag',
        }),
      )
    })

    it('skips nested dist manifests and resolves the real package root in built mode', async () => {
      const knownPaths = new Set([
        pkgJson,
        distPkgJson,
        pluginJson,
        wpBin,
        join(repoRoot, 'src/hooks/pretool-guard/index.ts'),
        join(repoRoot, 'src/hooks/post-tool/lint-after-edit.ts'),
        join(repoRoot, 'src/hooks/stop/qa-changed-files.ts'),
        join(repoRoot, 'src/hooks/guard-switch/index.ts'),
        join(repoRoot, 'src/hooks/sessionstart/index.ts'),
        join(repoRoot, 'src/hooks/precompact/index.ts'),
        join(repoRoot, 'src/hooks/test-quality-check.ts'),
      ])
      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockStatSync.mockReturnValue({ mode: 0o755 } as unknown as ReturnType<typeof statSync>)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === distPkgJson) {
          return JSON.stringify({ name: '@webpresso/agent-kit', type: 'module' })
        }
        if (String(path) === pkgJson) {
          return JSON.stringify({
            bin: {
              'wp-pretool-guard': './src/hooks/pretool-guard/index.ts',
              'wp-post-tool': './src/hooks/post-tool/lint-after-edit.ts',
              'wp-stop-qa': './src/hooks/stop/qa-changed-files.ts',
              'wp-guard-switch': './src/hooks/guard-switch/index.ts',
              'wp-sessionstart-routing': './src/hooks/sessionstart/index.ts',
              'wp-precompact-snapshot': './src/hooks/precompact/index.ts',
              'wp-test-quality-check': './src/hooks/test-quality-check.ts',
            },
          })
        }
        if (String(path) === pluginJson) {
          return JSON.stringify({ version: '0.1.0', hooks: {}, mcpServers: {} })
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)
      mockHealthyHookProbe()

      vi.stubGlobal('process', fakeProcess())

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true })
      expect(result.ok).toBe(true)
      expect(result.checks.find((check) => check.name === 'plugin.json integrity')?.ok).toBe(true)
    })

    it('reports hook probe stdin EPIPE instead of throwing an unhandled error', async () => {
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        wpBin,
        join(repoRoot, 'src/hooks/pretool-guard/index.ts'),
        join(repoRoot, 'src/hooks/post-tool/lint-after-edit.ts'),
        join(repoRoot, 'src/hooks/stop/qa-changed-files.ts'),
        join(repoRoot, 'src/hooks/guard-switch/index.ts'),
        join(repoRoot, 'src/hooks/sessionstart/index.ts'),
        join(repoRoot, 'src/hooks/precompact/index.ts'),
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
              'wp-precompact-snapshot': './src/hooks/precompact/index.ts',
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
        join(repoRoot, 'src/hooks/precompact/index.ts'),
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
              'wp-precompact-snapshot': './src/hooks/precompact/index.ts',
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
        join(repoRoot, 'src/hooks/precompact/index.ts'),
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
              'wp-precompact-snapshot': './src/hooks/precompact/index.ts',
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
        join(repoRoot, 'src/hooks/precompact/index.ts'),
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
              'wp-precompact-snapshot': './src/hooks/precompact/index.ts',
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
        join(repoRoot, 'src/hooks/precompact/index.ts'),
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
              'wp-precompact-snapshot': './src/hooks/precompact/index.ts',
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
        join(repoRoot, 'src/hooks/precompact/index.ts'),
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
              'wp-precompact-snapshot': './src/hooks/precompact/index.ts',
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
        join(repoRoot, 'src/hooks/precompact/index.ts'),
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
              'wp-precompact-snapshot': './src/hooks/precompact/index.ts',
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
              child.stdout.emit('data', Buffer.from('✓ webpresso\n'))
            } else if (command === 'opencode' && args?.[0] === 'mcp') {
              child.stdout.emit('data', Buffer.from('✓ webpresso\n'))
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
        join(repoRoot, 'src/hooks/precompact/index.ts'),
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
              'wp-precompact-snapshot': './src/hooks/precompact/index.ts',
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
              child.stdout.emit('data', Buffer.from('✗ webpresso\n'))
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

    it('omits the removed live-source dev-link row', async () => {
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        wpBin,
        join(repoRoot, 'src/hooks/pretool-guard/index.ts'),
        join(repoRoot, 'src/hooks/post-tool/lint-after-edit.ts'),
        join(repoRoot, 'src/hooks/stop/qa-changed-files.ts'),
        join(repoRoot, 'src/hooks/guard-switch/index.ts'),
        join(repoRoot, 'src/hooks/sessionstart/index.ts'),
        join(repoRoot, 'src/hooks/precompact/index.ts'),
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
              'wp-precompact-snapshot': './src/hooks/precompact/index.ts',
              'wp-test-quality-check': './src/hooks/test-quality-check.ts',
            },
          })
        }
        if (String(path) === pluginJson) {
          return JSON.stringify({ version: '0.1.0', hooks: {}, mcpServers: {} })
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)
      mockHealthyHookProbe()

      vi.stubGlobal('process', fakeProcess({ cwd: () => repoRoot }))

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true, cwd: repoRoot })
      expect(result.checks.find((check) => check.name === 'live-source dev-link')).toBeUndefined()
    })
  })

  describe('packaged host artifact reporting', () => {
    it('reports Codex plugin artifacts and preserves setup-managed hook ownership', async () => {
      const knownPaths = new Set([
        pluginJson,
        codexPluginJson,
        codexPluginMcpJson,
        codexPluginHooksJson,
        opencodePluginBridge,
      ])
      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pluginJson) {
          return JSON.stringify({
            name: 'agent-kit',
            version: '0.34.2',
            skills: './skills',
            commands: './commands',
            mcpServers: {
              webpresso: { command: '${CLAUDE_PLUGIN_ROOT}/bin/wp', args: ['mcp'] },
            },
          })
        }
        if (String(path) === codexPluginJson) {
          return JSON.stringify({
            name: 'agent-kit',
            version: '0.34.2',
            skills: './skills/',
            mcpServers: './codex.mcp.json',
            hooks: './hooks/hooks.json',
          })
        }
        if (String(path) === codexPluginMcpJson) {
          return JSON.stringify({
            webpresso: { command: '${PLUGIN_ROOT}/bin/wp', args: ['mcp'] },
          })
        }
        if (String(path) === codexPluginHooksJson) return JSON.stringify({ hooks: {} })
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)

      const { checkPackagedHostArtifacts, checkHostArtifactOwnership } =
        await import('#hooks/doctor')
      const artifacts = checkPackagedHostArtifacts(repoRoot)
      expect(artifacts.ok).toBe(true)
      expect(artifacts.detail).toContain('.codex-plugin/plugin.json')
      expect(artifacts.detail).toContain('codex.mcp.json')
      expect(artifacts.detail).toContain('hooks/hooks.json')
      expect(artifacts.detail).toContain('.claude-plugin/plugin.json')

      const ownership = checkHostArtifactOwnership(repoRoot)
      expect(ownership.ok).toBe(true)
      expect(ownership.detail).toContain(
        'Codex active hooks stay setup-managed in .codex/hooks.json',
      )
      expect(ownership.detail).toContain(
        'Claude active hooks stay setup-managed in .claude/settings.json',
      )
      expect(ownership.detail).toContain('OpenCode bridge is degraded')
      expect(ownership.detail).toContain('run `wp setup --host opencode`')
    })

    it('surfaces bounded host-specific repair hints when Codex artifacts are incomplete', async () => {
      const knownPaths = new Set([pluginJson, codexPluginJson])
      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pluginJson) return JSON.stringify({ version: '0.34.2' })
        if (String(path) === codexPluginJson) {
          return JSON.stringify({
            name: 'agent-kit',
            version: '0.34.2',
            mcpServers: './codex.mcp.json',
            hooks: './hooks/hooks.json',
          })
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)

      const { checkPackagedHostArtifacts } = await import('#hooks/doctor')
      const result = checkPackagedHostArtifacts(repoRoot)
      expect(result.ok).toBe(false)
      expect(result.detail).toContain('missing Codex artifact(s): hooks/hooks.json, codex.mcp.json')
      expect(result.detail).toContain('Codex repair: run `wp setup`')
      expect(result.detail).toContain('package repair: rebuild the public artifact from source')
      expect(result.detail).not.toContain('/Users/')
    })

    it('reports degraded lifecycle depth without claiming same host behavior', async () => {
      const { checkHostLifecycleDepth } = await import('#hooks/doctor')
      const result = checkHostLifecycleDepth()
      expect(result.ok).toBe(true)
      expect(result.detail).toContain(
        'Claude/Codex managed hooks: full for replacement-critical lifecycle events',
      )
      expect(result.detail).toContain('Cursor/OpenCode: degraded')
      expect(result.detail).toContain('host-specific lifecycle depth')
    })

    it('includes packaged artifact and lifecycle depth checks in the doctor result', async () => {
      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (String(path) === rtkMarker) throw new Error('ENOENT')
        return
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
              'wp-precompact-snapshot': './src/hooks/precompact/index.ts',
              'wp-test-quality-check': './src/hooks/test-quality-check.ts',
            },
          })
        }
        if (String(path) === pluginJson) {
          return JSON.stringify({
            version: '0.34.2',
            mcpServers: {
              webpresso: { command: '${CLAUDE_PLUGIN_ROOT}/bin/wp', args: ['mcp'] },
            },
          })
        }
        if (String(path) === codexPluginJson) {
          return JSON.stringify({
            name: 'agent-kit',
            version: '0.34.2',
            skills: './skills/',
            mcpServers: './codex.mcp.json',
            hooks: './hooks/hooks.json',
          })
        }
        if (String(path) === codexPluginMcpJson) {
          return JSON.stringify({
            webpresso: { command: '${PLUGIN_ROOT}/bin/wp', args: ['mcp'] },
          })
        }
        if (String(path) === codexPluginHooksJson) return JSON.stringify({ hooks: {} })
        return '{}'
      }) as typeof readFileSync)
      mockHealthyHookProbe()
      vi.stubGlobal('process', fakeProcess({ cwd: () => repoRoot }))

      const { runHooksDoctor } = await import('#hooks/doctor')
      const result = await runHooksDoctor({ skipMcp: true, cwd: repoRoot })
      expect(result.checks.find((check) => check.name === 'packaged host artifacts')).toMatchObject(
        {
          ok: true,
          advisory: true,
        },
      )
      expect(result.checks.find((check) => check.name === 'host artifact ownership')).toMatchObject(
        {
          ok: true,
          advisory: true,
        },
      )
      expect(result.checks.find((check) => check.name === 'host lifecycle depth')).toMatchObject({
        ok: true,
        advisory: true,
      })
    })
  })

  describe('checkManagedHooksInstalled', () => {
    it('warns to run wp setup when .claude/settings.json is absent', async () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })
      const { checkManagedHooksInstalled } = await import('#hooks/doctor')
      const result = checkManagedHooksInstalled('/repo')
      expect(result.ok).toBe(false)
      expect(result.detail).toContain('wp setup')
    })

    it('warns when settings.json lacks direct agent-kit hook commands', async () => {
      mockAccessSync.mockReturnValue(undefined)
      mockReadFileSync.mockReturnValue('{"hooks":{}}')
      const { checkManagedHooksInstalled } = await import('#hooks/doctor')
      const result = checkManagedHooksInstalled('/repo')
      expect(result.ok).toBe(false)
      expect(result.detail).toContain('wp setup')
    })

    it('passes when settings.json references direct agent-kit hook commands', async () => {
      mockAccessSync.mockReturnValue(undefined)
      mockReadFileSync.mockReturnValue(
        '{"hooks":{"PreToolUse":[{"hooks":[{"command":"node /pkg/bin/wp hook pretool-guard # wp-pretool-guard"}]}]}}',
      )
      const { checkManagedHooksInstalled } = await import('#hooks/doctor')
      const result = checkManagedHooksInstalled('/repo')
      expect(result.ok).toBe(true)
    })
  })

  describe('checkNativePluginRuntime', () => {
    it('reports native launch mode, target id, manifest path, and staged bin when runtime artifacts are present', async () => {
      const hostTargetId = `linux-${process.arch}`
      const runtimeTargetPath = join(repoRoot, 'bin', 'runtime', hostTargetId, 'wp')
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        join(repoRoot, 'bin', 'runtime-manifest.json'),
        join(repoRoot, 'bin', 'wp'),
        runtimeTargetPath,
      ])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) {
          return JSON.stringify({ bin: { wp: './bin/wp' } })
        }
        if (String(path) === pluginJson) {
          return JSON.stringify({
            version: '0.28.0',
            mcpServers: { webpresso: { command: '${CLAUDE_PLUGIN_ROOT}/bin/wp', args: ['mcp'] } },
          })
        }
        if (String(path) === join(repoRoot, 'bin', 'runtime-manifest.json')) {
          return JSON.stringify({
            binaryName: 'wp',
            targets: [
              {
                id: hostTargetId,
                os: 'linux',
                cpu: process.arch,
                packageName: `@webpresso/agent-kit-runtime-${hostTargetId}`,
              },
            ],
          })
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)

      const { checkNativePluginRuntime } = await import('#hooks/doctor')
      const result = checkNativePluginRuntime()

      expect(result.ok).toBe(true)
      expect(result.detail).toContain('launchMode=native')
      expect(result.detail).toContain(`targetId=${hostTargetId}`)
      expect(result.detail).toContain('manifest=')
      expect(result.detail).toContain('stagedBin=')
    })

    it('surfaces stale node-launcher drift and missing staged bin reasons without suggesting timeouts', async () => {
      const hostTargetId = `linux-${process.arch}`
      const runtimeManifestPath = join(repoRoot, 'bin', 'runtime-manifest.json')
      const knownPaths = new Set([pkgJson, pluginJson, runtimeManifestPath])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) {
          return JSON.stringify({ bin: { wp: './bin/wp' } })
        }
        if (String(path) === pluginJson) {
          return JSON.stringify({
            version: '0.28.0',
            mcpServers: {
              webpresso: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/bin/wp.js', 'mcp'] },
            },
          })
        }
        if (String(path) === runtimeManifestPath) {
          return JSON.stringify({
            binaryName: 'wp',
            targets: [
              {
                id: hostTargetId,
                os: 'linux',
                cpu: process.arch,
                packageName: `@webpresso/agent-kit-runtime-${hostTargetId}`,
              },
            ],
          })
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)

      const { checkNativePluginRuntime } = await import('#hooks/doctor')
      const result = checkNativePluginRuntime()

      expect(result.ok).toBe(false)
      expect(result.detail).toContain('launchMode=stale-node-launcher')
      expect(result.detail).toContain('reason=staged native launcher missing')
      expect(result.detail).not.toContain('timed out')
    })

    it('fails when the target runtime binary is missing even if root bin/wp is the JS selector', async () => {
      const hostTargetId = `linux-${process.arch}`
      const runtimeManifestPath = join(repoRoot, 'bin', 'runtime-manifest.json')
      const stagedBinPath = join(repoRoot, 'bin', 'wp')
      const runtimeTargetPath = join(repoRoot, 'bin', 'runtime', hostTargetId, 'wp')
      const knownPaths = new Set([pkgJson, pluginJson, runtimeManifestPath, stagedBinPath])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) {
          return JSON.stringify({ bin: { wp: './bin/wp' } })
        }
        if (String(path) === pluginJson) {
          return JSON.stringify({
            version: '0.28.0',
            mcpServers: { webpresso: { command: '${CLAUDE_PLUGIN_ROOT}/bin/wp', args: ['mcp'] } },
          })
        }
        if (String(path) === runtimeManifestPath) {
          return JSON.stringify({
            binaryName: 'wp',
            targets: [
              {
                id: hostTargetId,
                os: 'linux',
                cpu: process.arch,
                packageName: `@webpresso/agent-kit-runtime-${hostTargetId}`,
              },
            ],
          })
        }
        if (String(path) === stagedBinPath) {
          return "#!/usr/bin/env node\n\nimport { runNamedBin } from './_run.js'\n\nrunNamedBin('wp')\n"
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)

      const { checkNativePluginRuntime } = await import('#hooks/doctor')
      const result = checkNativePluginRuntime()

      expect(result.ok).toBe(false)
      expect(result.detail).toContain('launchMode=native')
      expect(result.detail).toContain(`candidates=`)
      expect(result.detail).toContain(runtimeTargetPath)
      expect(result.detail).toContain('reason=native runtime payload missing')
    })

    it('derives runtime package candidates for old manifests that omit packageName', async () => {
      const hostTargetId = `linux-${process.arch}`
      const runtimeManifestPath = join(repoRoot, 'bin', 'runtime-manifest.json')
      const stagedBinPath = join(repoRoot, 'bin', 'wp')
      const runtimeTargetPath = join(repoRoot, 'bin', 'runtime', hostTargetId, 'wp')
      const nestedRuntimePath = join(
        repoRoot,
        'node_modules',
        '@webpresso',
        `agent-kit-runtime-${hostTargetId}`,
        'bin',
        'wp',
      )
      const knownPaths = new Set([pkgJson, pluginJson, runtimeManifestPath, stagedBinPath])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) return JSON.stringify({ bin: { wp: './bin/wp' } })
        if (String(path) === pluginJson) {
          return JSON.stringify({
            version: '0.28.0',
            mcpServers: { webpresso: { command: '${CLAUDE_PLUGIN_ROOT}/bin/wp', args: ['mcp'] } },
          })
        }
        if (String(path) === runtimeManifestPath) {
          return JSON.stringify({
            binaryName: 'wp',
            targets: [{ id: hostTargetId, os: 'linux', cpu: process.arch }],
          })
        }
        if (String(path) === stagedBinPath) {
          return "#!/usr/bin/env node\n\nimport { runNamedBin } from './_run.js'\n\nrunNamedBin('wp')\n"
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)

      const { checkNativePluginRuntime } = await import('#hooks/doctor')
      const result = checkNativePluginRuntime()

      expect(result.ok).toBe(false)
      expect(result.detail).toContain(runtimeTargetPath)
      expect(result.detail).toContain(nestedRuntimePath)
      expect(result.detail).toContain('reason=native runtime payload missing')
    })

    it('skips unstaged source checkouts instead of warning about a missing target runtime binary', async () => {
      const hostTargetId = `linux-${process.arch}`
      const runtimeManifestPath = join(repoRoot, 'bin', 'runtime-manifest.json')
      const stagedBinPath = join(repoRoot, 'bin', 'wp')
      const runtimeBuildScriptPath = join(repoRoot, 'scripts', 'build-runtime-binaries.ts')
      const runtimeStageScriptPath = join(repoRoot, 'scripts', 'stage-plugin-runtime-artifacts.ts')
      const sourceCliPath = join(repoRoot, 'src', 'cli', 'cli.ts')
      const knownPaths = new Set([
        pkgJson,
        pluginJson,
        runtimeManifestPath,
        stagedBinPath,
        runtimeBuildScriptPath,
        runtimeStageScriptPath,
        sourceCliPath,
      ])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) {
          return JSON.stringify({ bin: { wp: './bin/wp' } })
        }
        if (String(path) === pluginJson) {
          return JSON.stringify({
            version: '0.28.0',
            mcpServers: { webpresso: { command: '${CLAUDE_PLUGIN_ROOT}/bin/wp', args: ['mcp'] } },
          })
        }
        if (String(path) === runtimeManifestPath) {
          return JSON.stringify({
            binaryName: 'wp',
            targets: [
              {
                id: hostTargetId,
                os: 'linux',
                cpu: process.arch,
                packageName: `@webpresso/agent-kit-runtime-${hostTargetId}`,
              },
            ],
          })
        }
        if (String(path) === stagedBinPath) {
          return "#!/usr/bin/env node\n\nimport { runNamedBin } from './_run.js'\n\nrunNamedBin('wp')\n"
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)

      const { checkNativePluginRuntime } = await import('#hooks/doctor')
      const result = checkNativePluginRuntime()

      expect(result.ok).toBe(true)
      expect(result.detail).toContain('launchMode=native')
      expect(result.detail).toContain('skipped')
      expect(result.detail).toContain('source checkout')
      expect(result.detail).toContain('build:runtime-binaries')
      expect(result.detail).toContain('stage:plugin-runtime')
    })

    it('still rejects missing native runtime payloads when the staged launcher is not JavaScript', async () => {
      const hostTargetId = `linux-${process.arch}`
      const runtimeManifestPath = join(repoRoot, 'bin', 'runtime-manifest.json')
      const stagedBinPath = join(repoRoot, 'bin', 'wp')
      const knownPaths = new Set([pkgJson, pluginJson, runtimeManifestPath, stagedBinPath])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) {
          return JSON.stringify({ bin: { wp: './bin/wp' } })
        }
        if (String(path) === pluginJson) {
          return JSON.stringify({
            version: '0.28.0',
            mcpServers: { webpresso: { command: '${CLAUDE_PLUGIN_ROOT}/bin/wp', args: ['mcp'] } },
          })
        }
        if (String(path) === runtimeManifestPath) {
          return JSON.stringify({
            binaryName: 'wp',
            targets: [
              {
                id: hostTargetId,
                os: 'linux',
                cpu: process.arch,
                packageName: `@webpresso/agent-kit-runtime-${hostTargetId}`,
              },
            ],
          })
        }
        if (String(path) === stagedBinPath) {
          return 'native-binary-placeholder'
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)

      const { checkNativePluginRuntime } = await import('#hooks/doctor')
      const result = checkNativePluginRuntime()

      expect(result.ok).toBe(false)
      expect(result.detail).toContain('reason=native runtime payload missing')
    })

    it('does not let the root JS selector mask a stale node-launcher plugin manifest', async () => {
      const hostTargetId = `linux-${process.arch}`
      const runtimeManifestPath = join(repoRoot, 'bin', 'runtime-manifest.json')
      const stagedBinPath = join(repoRoot, 'bin', 'wp')
      const runtimeTargetPath = join(repoRoot, 'bin', 'runtime', hostTargetId, 'wp')
      const knownPaths = new Set([pkgJson, pluginJson, runtimeManifestPath, stagedBinPath])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) {
          return JSON.stringify({ bin: { wp: './bin/wp' } })
        }
        if (String(path) === pluginJson) {
          return JSON.stringify({
            version: '0.28.0',
            mcpServers: {
              webpresso: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/bin/wp.js', 'mcp'] },
            },
          })
        }
        if (String(path) === runtimeManifestPath) {
          return JSON.stringify({
            binaryName: 'wp',
            targets: [
              {
                id: hostTargetId,
                os: 'linux',
                cpu: process.arch,
                packageName: `@webpresso/agent-kit-runtime-${hostTargetId}`,
              },
            ],
          })
        }
        if (String(path) === stagedBinPath) {
          return "#!/usr/bin/env node\n\nimport { runNamedBin } from './_run.js'\n\nrunNamedBin('wp')\n"
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)

      const { checkNativePluginRuntime } = await import('#hooks/doctor')
      const result = checkNativePluginRuntime()

      expect(result.ok).toBe(false)
      expect(result.detail).toContain('launchMode=stale-node-launcher')
      expect(result.detail).toContain(`candidates=`)
      expect(result.detail).toContain(runtimeTargetPath)
      expect(result.detail).toContain('reason=native runtime payload missing')
    })
  })

  describe('checkRootLauncherContract', () => {
    it('reports the explicit root launcher contract and JS-selector boundary', async () => {
      const launcherPath = join(repoRoot, 'bin', 'wp')
      const knownPaths = new Set([pkgJson, pluginJson, launcherPath])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === pkgJson) return JSON.stringify({ bin: { wp: './bin/wp' } })
        if (String(path) === pluginJson)
          return JSON.stringify({ version: '0.28.0', mcpServers: {} })
        if (String(path) === launcherPath) {
          return "#!/usr/bin/env node\n\nimport { runNamedBin } from './_run.js'\n\nrunNamedBin('wp')\n"
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)
      mockStatSync.mockReturnValue({ isFile: () => true, mode: 0o100755 } as ReturnType<
        typeof statSync
      >)

      const { checkRootLauncherContract } = await import('#hooks/doctor')
      const result = checkRootLauncherContract()

      expect(result.ok).toBe(true)
      expect(result.detail).toContain('contract=js-selector-runtime-lane')
      expect(result.detail).toContain('expected=bin/wp')
      expect(result.detail).toContain(
        'JS selector for runtime-required, phase2-runtime, and JS/Bun holdback lanes',
      )
    })
  })

  describe('checkOmxPluginCacheStaleSurfaceRepair', () => {
    it('labels bounded rewrites as stale-surface repair', async () => {
      const { checkOmxPluginCacheStaleSurfaceRepair } = await import('#hooks/doctor')
      const result = checkOmxPluginCacheStaleSurfaceRepair({
        codexHome: '/tmp/.codex',
        nodeBinary: '/abs/node',
        repair: () => [
          '/tmp/.codex/plugins/cache/oh-my-codex-local/oh-my-codex/0.18.10/hooks/hooks.json',
        ],
      })

      expect(result.ok).toBe(true)
      expect(result.detail).toContain('bounded stale-surface repair')
      expect(result.detail).toContain('positively identified stale OMX plugin-cache hook surface')
      expect(result.detail).toContain('durable ownership belongs to OMX setup/plugin generation')
    })

    it('reports cleanly when no stale OMX hook surfaces are positively identified', async () => {
      const { checkOmxPluginCacheStaleSurfaceRepair } = await import('#hooks/doctor')
      const result = checkOmxPluginCacheStaleSurfaceRepair({
        codexHome: '/tmp/.codex',
        nodeBinary: '/abs/node',
        repair: () => [],
      })

      expect(result.ok).toBe(true)
      expect(result.detail).toContain(
        'no positively identified stale OMX plugin-cache hook surfaces',
      )
      expect(result.detail).toContain('durable ownership belongs to OMX setup/plugin generation')
    })
  })

  describe('checkThirdPartyHookCoexistence', () => {
    it('reports no competing plugins when registry is absent', async () => {
      mockAccessSync.mockImplementation((() => {
        throw new Error('ENOENT')
      }) as typeof accessSync)

      const { checkThirdPartyHookCoexistence } = await import('#hooks/doctor')
      const result = checkThirdPartyHookCoexistence({ claudeConfigDir: '/tmp/.claude' })

      expect(result.ok).toBe(true)
      expect(result.detail).toContain('no Claude plugin registry found')
    })

    it('reports no competing plugins when OMC is not in the registry', async () => {
      const registryPath = '/tmp/.claude/plugins/installed_plugins.json'
      mockAccessSync.mockImplementation((() => undefined) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === registryPath) {
          return JSON.stringify({})
        }
        return ''
      }) as typeof readFileSync)

      const { checkThirdPartyHookCoexistence } = await import('#hooks/doctor')
      const result = checkThirdPartyHookCoexistence({ claudeConfigDir: '/tmp/.claude' })

      expect(result.ok).toBe(true)
      expect(result.detail).toContain('no competing hook plugins detected')
    })

    it('reports OMC version and coexistence model when OMC is installed', async () => {
      const registryPath = '/tmp/.claude/plugins/installed_plugins.json'
      mockAccessSync.mockImplementation((() => undefined) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === registryPath) {
          return JSON.stringify({
            plugins: {
              'oh-my-claudecode@omc': [
                {
                  version: '4.13.7',
                  scope: 'user',
                  installPath: '/tmp/.claude/plugins/cache/omc/oh-my-claudecode/4.13.7',
                },
              ],
            },
          })
        }
        return ''
      }) as typeof readFileSync)

      const { checkThirdPartyHookCoexistence } = await import('#hooks/doctor')
      const result = checkThirdPartyHookCoexistence({ claudeConfigDir: '/tmp/.claude' })

      expect(result.ok).toBe(true)
      expect(result.detail).toContain('OMC 4.13.7 detected')
      expect(result.detail).toContain('double-fire is expected and idempotent')
      // The key survivability claim: settings.json and OMC plugin cache are separate files
      expect(result.detail).toContain('survive omc update')
      expect(result.detail).toContain('separate files')
    })

    it('prefers user-scope version label when both user and project scopes are installed', async () => {
      const registryPath = '/tmp/.claude/plugins/installed_plugins.json'
      mockAccessSync.mockImplementation((() => undefined) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === registryPath) {
          return JSON.stringify({
            plugins: {
              'oh-my-claudecode@omc': [
                { version: '4.14.0', scope: 'project', installPath: '/tmp/cache/4.14.0' },
                { version: '4.13.7', scope: 'user', installPath: '/tmp/cache/4.13.7' },
              ],
            },
          })
        }
        return ''
      }) as typeof readFileSync)

      const { checkThirdPartyHookCoexistence } = await import('#hooks/doctor')
      const result = checkThirdPartyHookCoexistence({ claudeConfigDir: '/tmp/.claude' })

      expect(result.ok).toBe(true)
      // User-scope entry (4.13.7) is preferred over project-scope (4.14.0)
      expect(result.detail).toContain('OMC 4.13.7 detected')
    })

    it('is ok but skipped when registry JSON is unparseable', async () => {
      const registryPath = '/tmp/.claude/plugins/installed_plugins.json'
      mockAccessSync.mockImplementation((() => undefined) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === registryPath) return 'not-json{'
        return ''
      }) as typeof readFileSync)

      const { checkThirdPartyHookCoexistence } = await import('#hooks/doctor')
      const result = checkThirdPartyHookCoexistence({ claudeConfigDir: '/tmp/.claude' })

      expect(result.ok).toBe(true)
      expect(result.detail).toContain('skipped')
    })
  })

  describe('buildHooksDoctorFixPlan', () => {
    it('returns requires-approval when the hooks manifest is missing', async () => {
      const knownPaths = new Set(['/repo/.claude/settings.json', '/repo/.codex/hooks.json'])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)

      const { buildHooksDoctorFixPlan } = await import('#hooks/doctor')
      const result = buildHooksDoctorFixPlan('/repo')

      expect(result.status).toBe('requires-approval')
      expect(result.nextCommand).toBe('wp setup')
      expect(result.preservedFiles).toEqual([
        '/repo/.claude/settings.json',
        '/repo/.codex/hooks.json',
      ])
    })

    it('returns source-maintenance setup guidance for the agent-kit source repo when the hooks manifest is missing', async () => {
      const knownPaths = new Set([
        '/repo/package.json',
        '/repo/.claude/settings.json',
        '/repo/.codex/hooks.json',
      ])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === '/repo/package.json') {
          return JSON.stringify({ name: '@webpresso/agent-kit' })
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)

      const { buildHooksDoctorFixPlan } = await import('#hooks/doctor')
      const result = buildHooksDoctorFixPlan('/repo')

      expect(result.status).toBe('requires-approval')
      expect(result.nextCommand).toBe('wp setup --source-maintenance')
    })

    it('returns blocked when installed hooks are unknown to the manifest', async () => {
      const manifestPath = '/repo/.webpresso/hooks-manifest.json'
      const settingsPath = '/repo/.claude/settings.json'
      const knownPaths = new Set([manifestPath, settingsPath])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === manifestPath) {
          return JSON.stringify({
            version: 1,
            generatedAt: '2026-06-08T00:00:00.000Z',
            claude: {},
            codex: {},
            vendorState: { claude: 'enabled', codex: 'enabled' },
          })
        }
        if (String(path) === settingsPath) {
          return JSON.stringify({
            hooks: {
              PreToolUse: [{ hooks: [{ type: 'command', command: 'wp-pretool-guard' }] }],
            },
          })
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)

      const { buildHooksDoctorFixPlan } = await import('#hooks/doctor')
      const result = buildHooksDoctorFixPlan('/repo')

      expect(result.status).toBe('blocked')
      expect(result.nextCommand).toBe('wp hooks status')
      expect(result.preservedFiles).toEqual(['/repo/.claude/settings.json'])
    })

    it('returns prepared when manifest-backed hooks are missing but there are no unknown installed hooks', async () => {
      const manifestPath = '/repo/.webpresso/hooks-manifest.json'
      const settingsPath = '/repo/.claude/settings.json'
      const knownPaths = new Set([manifestPath, settingsPath])

      mockAccessSync.mockImplementation(((path: Parameters<typeof accessSync>[0]) => {
        if (knownPaths.has(String(path))) return
        throw new Error('ENOENT')
      }) as typeof accessSync)
      mockReadFileSync.mockImplementation(((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path) === manifestPath) {
          return JSON.stringify({
            version: 1,
            generatedAt: '2026-06-08T00:00:00.000Z',
            claude: {
              PreToolUse: [{ hooks: [{ type: 'command', command: 'wp-pretool-guard' }] }],
            },
            codex: {},
            vendorState: { claude: 'enabled', codex: 'enabled' },
          })
        }
        if (String(path) === settingsPath) {
          return JSON.stringify({ hooks: {} })
        }
        throw new Error(`unexpected read: ${String(path)}`)
      }) as typeof readFileSync)

      const { buildHooksDoctorFixPlan } = await import('#hooks/doctor')
      const result = buildHooksDoctorFixPlan('/repo')

      expect(result.status).toBe('prepared')
      expect(result.nextCommand).toBe('wp setup --restore-hooks')
      expect(result.preservedFiles).toEqual(['/repo/.claude/settings.json'])
    })
  })
})
