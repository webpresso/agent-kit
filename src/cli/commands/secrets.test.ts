import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { runSecretsDoctorCommand } from './secrets.js'

const roots: string[] = []

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

function tempRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'wp-secrets-doctor-'))
  roots.push(root)
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
  mkdirSync(path.join(root, '.webpresso'), { recursive: true })
  writeFileSync(
    path.join(root, '.webpresso', 'secrets.config.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        providers: {
          default: {
            type: 'doppler',
            project: 'demo-project',
          },
        },
        profiles: {
          preview: { provider: 'default', environment: 'stg' },
        },
        sinks: {},
      },
      null,
      2,
    ),
  )
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('wp secrets doctor', () => {
  it('validates schemaVersion 1 committed metadata from nested cwd', async () => {
    const root = tempRepo()
    const nested = path.join(root, 'apps', 'web')
    mkdirSync(nested, { recursive: true })
    const stdout = makeWriter()

    const exitCode = await runSecretsDoctorCommand({
      cwd: nested,
      profile: 'preview',
      json: true,
      stdout: stdout.writer,
    })

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.output())).toMatchObject({
      ok: true,
      configured: true,
      manager: 'doppler',
      projectId: 'demo-project',
      profile: 'preview',
      environment: 'stg',
    })
  })


  it('fails without echoing secret-like profile metadata', async () => {
    const root = tempRepo()
    writeFileSync(
      path.join(root, '.webpresso', 'secrets.config.json'),
      JSON.stringify({
        schemaVersion: 1,
        providers: { default: { type: 'doppler', project: 'demo-project' } },
        profiles: { preview: { provider: 'default', environment: 'ctx7sk-reviewleak000000' } },
        sinks: {},
      }),
    )
    const stdout = makeWriter()

    const exitCode = await runSecretsDoctorCommand({
      cwd: root,
      profile: 'preview',
      json: true,
      stdout: stdout.writer,
    })

    expect(exitCode).toBe(1)
    expect(stdout.output()).not.toContain('ctx7sk-reviewleak000000')
    expect(JSON.parse(stdout.output())).toMatchObject({
      ok: false,
      error: expect.stringContaining('must not contain secret values'),
    })
  })


  it('fails without echoing secret-like provider references', async () => {
    const root = tempRepo()
    writeFileSync(
      path.join(root, '.webpresso', 'secrets.config.json'),
      JSON.stringify({
        schemaVersion: 1,
        providers: { default: { type: 'doppler', project: 'demo-project' } },
        profiles: { preview: { provider: 'ctx7sk-reviewleak000000', environment: 'stg' } },
        sinks: {},
      }),
    )
    const stdout = makeWriter()

    const exitCode = await runSecretsDoctorCommand({ cwd: root, profile: 'preview', json: true, stdout: stdout.writer })

    expect(exitCode).toBe(1)
    expect(stdout.output()).not.toContain('ctx7sk-reviewleak000000')
    expect(JSON.parse(stdout.output())).toMatchObject({
      ok: false,
      error: expect.stringContaining('must not contain secret values'),
    })
  })

  it('fails without echoing secret-like profile ids', async () => {
    const root = tempRepo()
    writeFileSync(
      path.join(root, '.webpresso', 'secrets.config.json'),
      JSON.stringify({
        schemaVersion: 1,
        providers: { default: { type: 'doppler', project: 'demo-project' } },
        profiles: { 'ctx7sk-reviewleak000000': { provider: 'default', environment: 'stg' } },
        sinks: {},
      }),
    )
    const stdout = makeWriter()

    const exitCode = await runSecretsDoctorCommand({
      cwd: root,
      profile: 'ctx7sk-reviewleak000000',
      json: true,
      stdout: stdout.writer,
    })

    expect(exitCode).toBe(1)
    expect(stdout.output()).not.toContain('ctx7sk-reviewleak000000')
    expect(JSON.parse(stdout.output())).toMatchObject({
      ok: false,
      error: expect.stringContaining('must not contain secret values'),
    })
  })

  it('rejects profile provider names that are not declared', async () => {
    const root = tempRepo()
    writeFileSync(
      path.join(root, '.webpresso', 'secrets.config.json'),
      JSON.stringify({
        schemaVersion: 1,
        providers: { default: { type: 'doppler', project: 'demo-project' } },
        profiles: { preview: { provider: 'missing', environment: 'stg' } },
        sinks: {},
      }),
    )
    const stdout = makeWriter()

    const exitCode = await runSecretsDoctorCommand({ cwd: root, profile: 'preview', json: true, stdout: stdout.writer })

    expect(exitCode).toBe(1)
    expect(JSON.parse(stdout.output())).toMatchObject({
      ok: false,
      error: expect.stringContaining('unknown provider'),
    })
  })

  it('reports unknown profile as a JSON failure', async () => {
    const stdout = makeWriter()

    const exitCode = await runSecretsDoctorCommand({
      cwd: tempRepo(),
      profile: 'production',
      json: true,
      stdout: stdout.writer,
    })

    expect(exitCode).toBe(1)
    expect(JSON.parse(stdout.output())).toMatchObject({
      ok: false,
      profile: 'production',
      error: expect.stringContaining('Unknown secret profile "production"'),
    })
  })
})
