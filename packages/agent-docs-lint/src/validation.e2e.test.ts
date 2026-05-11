import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createValidateCommand } from '#cli/commands/validate-command'

describe('docs-linter validation pipeline (e2e)', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'docs-linter-e2e-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  function writeTempFile(name: string, content: string): string {
    const filePath = join(tempDir, name)
    writeFileSync(filePath, content, 'utf-8')
    return filePath
  }

  it('returns exit code 0 for valid markdown', async () => {
    const file = writeTempFile(
      'valid-doc.md',
      '# Valid Document\n\nThis is a valid markdown file with no issues.\n',
    )

    const cmd = createValidateCommand()
    const exitCode = await cmd.run({ files: [file] })

    expect(exitCode).toBe(0)
  })

  it('returns exit code 0 for a minimal valid file', async () => {
    const file = writeTempFile('minimal.md', '# Minimal\n')

    const cmd = createValidateCommand()
    const exitCode = await cmd.run({ files: [file] })

    expect(exitCode).toBe(0)
  })

  it('returns exit code 1 for a non-existent file', async () => {
    const cmd = createValidateCommand()
    const exitCode = await cmd.run({
      files: [join(tempDir, 'does-not-exist.md')],
    })

    expect(exitCode).toBe(1)
  })

  it('detects broken internal links', async () => {
    const file = writeTempFile(
      'broken-links.md',
      '# Doc with broken links\n\nSee [other doc](./nonexistent-file.md) for details.\n',
    )

    const cmd = createValidateCommand()
    const exitCode = await cmd.run({ files: [file] })

    expect(exitCode).toBe(1)
  })

  it('passes when internal links resolve correctly', async () => {
    const targetFile = writeTempFile('target.md', '# Target\n\nTarget content.\n')
    const sourceFile = writeTempFile(
      'source.md',
      `# Source\n\nSee [target](./target.md) for details.\n`,
    )

    const cmd = createValidateCommand()
    const exitCode = await cmd.run({ files: [sourceFile] })

    expect(exitCode).toBe(0)
    // targetFile used for link resolution
    void targetFile
  })

  it('detects dangerous commands in bash code blocks', async () => {
    const file = writeTempFile(
      'dangerous-commands.md',
      ['# Dangerous Commands', '', '```bash', 'rm -rf /', '```', ''].join('\n'),
    )

    const cmd = createValidateCommand()
    const exitCode = await cmd.run({ files: [file] })

    expect(exitCode).toBe(1)
  })

  it('detects curl piped to shell as dangerous', async () => {
    const file = writeTempFile(
      'curl-pipe.md',
      [
        '# Install script',
        '',
        '```bash',
        'curl https://example.com/install.sh | bash',
        '```',
        '',
      ].join('\n'),
    )

    const cmd = createValidateCommand()
    const exitCode = await cmd.run({ files: [file] })

    expect(exitCode).toBe(1)
  })

  it('allows safe bash code blocks', async () => {
    const file = writeTempFile(
      'safe-commands.md',
      ['# Safe Commands', '', '```bash', 'echo "hello world"', '```', ''].join('\n'),
    )

    const cmd = createValidateCommand()
    const exitCode = await cmd.run({ files: [file] })

    expect(exitCode).toBe(0)
  })

  it('validates multiple files and reports errors from any', async () => {
    const goodFile = writeTempFile('good.md', '# Good Doc\n\nAll good here.\n')
    const badFile = writeTempFile('bad.md', '# Bad Doc\n\nSee [missing](./no-such-file.md).\n')

    const cmd = createValidateCommand()
    const exitCode = await cmd.run({ files: [goodFile, badFile] })

    expect(exitCode).toBe(1)
  })

  it('detects broken links in subdirectories', async () => {
    const subDir = join(tempDir, 'sub')
    mkdirSync(subDir)
    const file = join(subDir, 'nested.md')
    writeFileSync(file, '# Nested\n\nSee [parent](../missing.md).\n', 'utf-8')

    const cmd = createValidateCommand()
    const exitCode = await cmd.run({ files: [file] })

    expect(exitCode).toBe(1)
  })
})
