import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

let runSecretsConfigCommand: typeof import('./config.js').runSecretsConfigCommand

beforeAll(async () => {
  ;({ runSecretsConfigCommand } = await import('./config.js'))
})

function makeWriter() {
  const chunks: string[] = []
  return {
    writer: {
      write: (value: string) => {
        chunks.push(value)
        return true
      },
    },
    output: () => chunks.join(''),
  }
}

const tempRoots: string[] = []

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'wp-config-secrets-'))
  mkdirSync(join(root, '.git'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (tempRoots.length > 0) rmSync(tempRoots.pop()!, { recursive: true, force: true })
})

describe('wp config secrets', () => {
  it('shows setup guidance when no config exists', async () => {
    const stdout = makeWriter()
    const exitCode = await runSecretsConfigCommand(
      'show',
      [],
      {},
      {
        getPath: () => '/repo/.git/webpresso/secrets.json',
        readConfig: () => null,
        stdout: stdout.writer,
      },
    )

    expect(exitCode).toBe(1)
    expect(stdout.output()).toContain('wp secrets doctor --profile preview --json')
  })

  it('writes an explicit manager/project selection', async () => {
    const writeConfig = vi.fn()
    const stdout = makeWriter()
    const exitCode = await runSecretsConfigCommand(
      'set',
      ['doppler', 'ozby-shell'],
      { label: 'Ozby Shell' },
      {
        getPath: () => '/repo/.git/webpresso/secrets.json',
        writeConfig,
        stdout: stdout.writer,
      },
    )

    expect(exitCode).toBe(0)
    expect(writeConfig).toHaveBeenCalledWith(
      {
        manager: 'doppler',
        projectId: 'ozby-shell',
        projectLabel: 'Ozby Shell',
      },
      expect.any(String),
    )
    expect(stdout.output()).toContain('Configured doppler project ozby-shell')
  })

  it('persists explicit selections without loading the webpresso framework runtime', async () => {
    const root = makeRepo()
    const stdout = makeWriter()
    const exitCode = await runSecretsConfigCommand(
      'set',
      ['infisical', 'shell-worker'],
      { cwd: root, label: 'Shell Worker' },
      { stdout: stdout.writer },
    )

    const configPath = join(root, '.git', 'webpresso', 'secrets.json')
    expect(exitCode).toBe(0)
    expect(existsSync(configPath)).toBe(true)
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({
      manager: 'infisical',
      projectId: 'shell-worker',
      projectLabel: 'Shell Worker',
    })

    const show = makeWriter()
    await expect(
      runSecretsConfigCommand('show', [], { cwd: root, json: true }, { stdout: show.writer }),
    ).resolves.toBe(0)
    expect(JSON.parse(show.output())).toMatchObject({
      configured: true,
      path: configPath,
      config: { manager: 'infisical', projectId: 'shell-worker' },
    })
  })

  it('reports invalid persisted secrets config with a path-specific command error', async () => {
    const root = makeRepo()
    const configPath = join(root, '.git', 'webpresso', 'secrets.json')
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(configPath, JSON.stringify({ manager: 'unknown', projectId: 'x' }), 'utf8')

    await expect(runSecretsConfigCommand('show', [], { cwd: root })).rejects.toMatchObject({
      message: `Invalid secret manager config at ${configPath}`,
      exitCode: 1,
    })
  })

  it('writes runtime overrides to the git common dir in linked worktrees', async () => {
    const repoRoot = makeRepo()
    writeFileSync(join(repoRoot, 'README.md'), 'seed\n', 'utf8')
    execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.email', 'codex@example.com'], {
      cwd: repoRoot,
      stdio: 'ignore',
    })
    execFileSync('git', ['config', 'user.name', 'Codex'], { cwd: repoRoot, stdio: 'ignore' })
    execFileSync('git', ['add', 'README.md'], { cwd: repoRoot, stdio: 'ignore' })
    execFileSync('git', ['commit', '-m', 'init'], { cwd: repoRoot, stdio: 'ignore' })
    const worktreePath = join(tmpdir(), `wp-config-worktree-${Date.now()}`)
    tempRoots.push(worktreePath)
    execFileSync('git', ['worktree', 'add', worktreePath], { cwd: repoRoot, stdio: 'ignore' })

    await expect(
      runSecretsConfigCommand('set', ['doppler', 'platform-dev'], { cwd: worktreePath }),
    ).resolves.toBe(0)

    const commonConfigPath = join(repoRoot, '.git', 'webpresso', 'secrets.json')
    expect(existsSync(commonConfigPath)).toBe(true)
    expect(JSON.parse(readFileSync(commonConfigPath, 'utf8'))).toMatchObject({
      manager: 'doppler',
      projectId: 'platform-dev',
    })
  })

  it('reports healthy status when the selected adapter is available and authenticated', async () => {
    const stdout = makeWriter()
    const exitCode = await runSecretsConfigCommand(
      'status',
      [],
      {},
      {
        getPath: () => '/repo/.git/webpresso/secrets.json',
        readConfig: () => ({ manager: 'doppler', projectId: 'ozby-shell' }),
        registry: {
          get: () =>
            ({
              displayName: 'Doppler',
              checkAvailability: async () => ({ available: true }),
              checkAuthentication: async () => ({ authenticated: true }),
            }) as any,
        },
        stdout: stdout.writer,
      },
    )

    expect(exitCode).toBe(0)
    expect(stdout.output()).toContain('configured: yes')
    expect(stdout.output()).toContain('authenticated: yes')
  })

  it('returns a deterministic setup diagnostic when no setup dependency is injected', async () => {
    await expect(runSecretsConfigCommand('setup', [], { cwd: makeRepo() })).rejects.toThrow(
      /Interactive secret-manager setup is not bundled/,
    )
  })

  it('supports injected setup flows without requiring a framework runtime', async () => {
    const setup = vi.fn(async () => ({ manager: 'doppler' as const, projectId: 'ozby-shell' }))
    const stdout = makeWriter()
    const exitCode = await runSecretsConfigCommand(
      'setup',
      [],
      { json: true },
      {
        getPath: () => '/repo/.git/webpresso/secrets.json',
        setup,
        stdout: stdout.writer,
      },
    )

    expect(exitCode).toBe(0)
    expect(setup).toHaveBeenCalledWith({ cwd: expect.any(String) })
    expect(JSON.parse(stdout.output())).toMatchObject({
      ok: true,
      config: { manager: 'doppler', projectId: 'ozby-shell' },
    })
  })

  it('guards against reintroducing a required framework runtime import', () => {
    const commandSource = readFileSync(resolve(import.meta.dirname, 'config.ts'), 'utf8')

    expect(commandSource).not.toContain('@webpresso/framework/runtime/env')
    expect(commandSource).not.toContain("import('@webpresso/framework")
  })
})
