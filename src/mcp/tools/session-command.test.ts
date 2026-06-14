import { mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { validateCommand } from './_session-command.js'

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
