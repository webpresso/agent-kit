import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@webpresso/webpresso/runtime/env', () => ({
  getSecretsConfigPath: () => '/repo/.git/webpresso/secrets.json',
  readSecretsConfig: () => null,
  runSecretManagerSetup: async () => ({ manager: 'doppler', projectId: 'mock-project' }),
  secretManagerRegistry: new Map(),
  writeSecretsConfig: () => {},
}))

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
    expect(stdout.output()).toContain('Run: wp config secrets setup')
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

  it('delegates setup to the shared runtime flow', async () => {
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
})
