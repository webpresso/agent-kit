import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { registerDoctorCommand, runDoctor } from './doctor.js'

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ak-doctor-'))
  mkdirSync(join(dir, '.git'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo', private: true }))
  return dir
}

function buildFakeCli() {
  let registeredAction:
    | ((options: {
        root?: string
        docsRoot?: string
        fix?: boolean
        legacyOmx?: boolean
      }) => Promise<number>)
    | undefined

  const cli = {
    command: (_name: string, _desc: string) => ({
      option: (_flag: string, _desc: string) => ({
        option: (_flag2: string, _desc2: string) => ({
          option: (_flag3: string, _desc3: string) => ({
            option: (_flag4: string, _desc4: string) => ({
              action: (fn: typeof registeredAction) => {
                registeredAction = fn
              },
            }),
          }),
        }),
      }),
    }),
    getAction: () => registeredAction,
  }

  return cli
}

describe('runDoctor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 0 on a clean minimal repo', async () => {
    const repo = tempRepo()
    try {
      const logs: string[] = []
      vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
        logs.push(String(msg ?? ''))
      })

      const code = await runDoctor({ root: repo })

      expect(code).toBe(0)
      expect(logs.join('\n')).toContain('Catalog drift — single package (no workspace file): OK')
      expect(logs.join('\n')).toContain(
        'Hook/plugin health remains separate: run `ak hooks doctor`.',
      )
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it('returns 1 and prints remediation for missing docs frontmatter', async () => {
    const repo = tempRepo()
    mkdirSync(join(repo, 'docs'), { recursive: true })
    writeFileSync(join(repo, 'docs', 'guide.md'), '# hello\n')
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ''))
    })

    const code = await runDoctor({ root: repo })

    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('Docs frontmatter: FAILED')
    expect(logs.join('\n')).toContain('→ remediation: ak audit docs-frontmatter --fix')
    rmSync(repo, { recursive: true, force: true })
  })

  it('returns repo to clean when --fix is used for docs frontmatter', async () => {
    const repo = tempRepo()
    mkdirSync(join(repo, 'docs'), { recursive: true })
    const doc = join(repo, 'docs', 'guide.md')
    writeFileSync(doc, '# hello\n')

    const code = await runDoctor({ root: repo, fix: true })

    expect(code).toBe(0)
    expect(readFileSync(doc, 'utf8')).toContain('last_updated:')
    rmSync(repo, { recursive: true, force: true })
  })
})

describe('registerDoctorCommand', () => {
  it('returns the exit code from runDoctor', async () => {
    const cli = buildFakeCli()
    registerDoctorCommand(cli as never)
    const action = cli.getAction()
    expect(action).not.toBe(undefined)
    const code = await action!({})
    expect([0, 1, 2]).toContain(code)
  })
})
