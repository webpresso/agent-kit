import { mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SessionMemoryStore } from '#session-memory/store.js'
import { runSessionCommand, validateCommand } from './_session-command.js'

let projectRoot: string
let outsideRoot: string
let symlinkPath: string

beforeEach(() => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'wp-session-command-root-')))
  outsideRoot = realpathSync(mkdtempSync(join(tmpdir(), 'wp-session-command-outside-')))
  symlinkPath = join(projectRoot, 'escaping-symlink')
  symlinkSync(outsideRoot, symlinkPath)
})

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true })
  rmSync(outsideRoot, { recursive: true, force: true })
})

describe('validateCommand', () => {
  it('allows safe commands inside the trusted project root', () => {
    expect(() => validateCommand('echo hello', projectRoot, projectRoot)).not.toThrow()
  })

  it('rejects top-level semicolon command injection', () => {
    expect(() => validateCommand('echo hello; rm -rf /', projectRoot, projectRoot)).toThrow(
      /disallowed shell syntax/u,
    )
  })

  it('rejects newline command injection', () => {
    expect(() => validateCommand('echo hello\nrm -rf /', projectRoot, projectRoot)).toThrow(
      /disallowed shell syntax/u,
    )
  })

  it('rejects unquoted command substitution', () => {
    expect(() => validateCommand('echo $(cat /etc/passwd)', projectRoot, projectRoot)).toThrow(
      /disallowed shell syntax/u,
    )
  })

  it('rejects backtick command substitution', () => {
    expect(() => validateCommand('echo `cat /etc/passwd`', projectRoot, projectRoot)).toThrow(
      /disallowed shell syntax/u,
    )
  })

  it('rejects top-level pipe operators', () => {
    expect(() => validateCommand('echo hello | cat', projectRoot, projectRoot)).toThrow(
      /disallowed shell syntax/u,
    )
  })

  it('rejects top-level output redirection', () => {
    expect(() => validateCommand('echo pwned > /etc/hosts', projectRoot, projectRoot)).toThrow(
      /disallowed shell syntax/u,
    )
  })

  it('allows shell metacharacters inside quoted strings', () => {
    expect(() =>
      validateCommand(
        'printf "%s\\n" "hello; world | not redirected > anywhere"',
        projectRoot,
        projectRoot,
      ),
    ).not.toThrow()
  })

  it('rejects cwd outside the independently trusted project root', () => {
    expect(() => validateCommand('echo hello', outsideRoot, projectRoot)).toThrow(
      /outside trusted project root/u,
    )
  })

  it('rejects cwd symlinks that escape the trusted project root', () => {
    expect(() => validateCommand('echo hello', symlinkPath, projectRoot)).toThrow(
      /outside trusted project root/u,
    )
  })
})

describe('runSessionCommand', () => {
  it('redacts command output before indexing and elision retrieval', async () => {
    const secret = 'ghp_abcdefghijklmnopqrstuvwxyz1234567890'
    const dbPath = join(projectRoot, 'session-memory.db')

    const result = await runSessionCommand({
      command: `printf "%s" "GITHUB_TOKEN=${secret}"`,
      label: 'secret-command-output',
      cwd: projectRoot,
      projectRoot,
      timeoutMs: 5_000,
      dbPath,
    })

    expect(JSON.stringify(result)).not.toContain(secret)
    expect(result.warnings).toContain('command output was redacted before indexing')
    expect(result.elisions).toHaveLength(1)

    const store = new SessionMemoryStore(dbPath)
    try {
      const chunks = store.getChunksBySource('secret-command-output')
      expect(chunks.map((chunk) => chunk.text).join('')).not.toContain(secret)
      expect(chunks.map((chunk) => chunk.text).join('')).toContain('GITHUB_TOKEN=gh***90')
      const elision = result.elisions?.[0]
      expect(elision?.id).toMatch(/^elision:[a-f0-9]{32}$/u)
      const retrieved = elision ? store.getChunkById(elision.id) : undefined
      expect(retrieved?.text).not.toContain(secret)
      expect(retrieved?.text).toContain('GITHUB_TOKEN=gh***90')
    } finally {
      store.close()
    }
  })
})
