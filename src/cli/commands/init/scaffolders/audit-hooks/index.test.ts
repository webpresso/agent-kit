import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { scaffoldAuditHooks } from './index.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = path.join(
    os.tmpdir(),
    `wp-audit-hooks-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tmpDir, { recursive: true })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

const preCommitPath = (root: string): string => path.join(root, '.husky', 'pre-commit')

describe('scaffoldAuditHooks', () => {
  it('creates .husky/pre-commit with shebang and comment header when missing', async () => {
    const result = scaffoldAuditHooks({ repoRoot: tmpDir, options: {} })
    expect(result.action).toBe('created')
    expect(result.preCommitPath).toBe(preCommitPath(tmpDir))

    const content = await readFile(preCommitPath(tmpDir), 'utf8')
    expect(content).toContain('#!/bin/sh')
    expect(content).toContain('# webpresso audit hooks (staged mode — fast)')
    expect(content).toContain('wp format || exit 1')
    expect(content).toContain('git add -- "$file"')
    expect(content).toContain('md|mdx')
    expect(content).toContain('|| exit 1')
    expect(content).toContain('wp audit no-dev-vars')
    expect(content).toContain('wp audit absolute-path-policy --root .')
    expect(content).toContain('wp audit secret-provider-quarantine')
    expect(content).not.toContain('skill-sizes')
    expect(content).not.toContain('broken-refs')
    // Audits are gated on staged source/config and the whole-repo guardrails
    // suite is never run per-commit.
    expect(content).toContain('git diff --cached --name-only --diff-filter=ACMR')
    expect(content).toContain('(ts|tsx|js|jsx')
    expect(content).not.toContain('audit guardrails')
  })

  it('is idempotent when the managed format and audit block is already present', async () => {
    await mkdir(path.join(tmpDir, '.husky'), { recursive: true })
    await writeFile(
      preCommitPath(tmpDir),
      [
        '#!/bin/sh',
        '# webpresso audit hooks (staged mode — fast)',
        'STAGED="$(git diff --cached --name-only --diff-filter=ACMR)"',
        'FORMAT_FILES="$(printf \'%s\\n\' "$STAGED" | grep -E \'\\.(ts|tsx|js|jsx|cjs|mjs|json|ya?ml|sh|tmpl|md|mdx)$\' || true)"',
        'if [ -n "$FORMAT_FILES" ]; then',
        '  wp format || exit 1',
        '  printf \'%s\\n\' "$FORMAT_FILES" | while IFS= read -r file; do',
        '    [ -n "$file" ] || continue',
        '    git add -- "$file" || exit 1',
        '  done',
        '  STAGED="$(git diff --cached --name-only --diff-filter=ACMR)"',
        'fi',
        'wp audit no-dev-vars',
        'wp audit absolute-path-policy --root .',
        'wp audit secret-provider-quarantine',
        '',
      ].join('\n'),
      'utf8',
    )

    const result = scaffoldAuditHooks({ repoRoot: tmpDir, options: {} })
    expect(result.action).toBe('identical')
  })

  it('appends comment header to existing hook without removing existing content', async () => {
    await mkdir(path.join(tmpDir, '.husky'), { recursive: true })
    await writeFile(preCommitPath(tmpDir), '#!/bin/sh\npnpm lint\n', 'utf8')

    const result = scaffoldAuditHooks({ repoRoot: tmpDir, options: {} })
    expect(result.action).toBe('appended')

    const content = await readFile(preCommitPath(tmpDir), 'utf8')
    expect(content).toContain('pnpm lint')
    expect(content).toContain('# webpresso audit hooks (staged mode — fast)')
    expect(content).toContain('wp format || exit 1')
    expect(content).toContain('git add -- "$file"')
    expect(content).toContain('md|mdx')
    expect(content).toContain('|| exit 1')
    expect(content).toContain('wp audit no-dev-vars')
    expect(content).toContain('wp audit absolute-path-policy --root .')
    expect(content).toContain('wp audit secret-provider-quarantine')
  })

  it('upgrades legacy audit-only hooks to add format and restage behavior', async () => {
    await mkdir(path.join(tmpDir, '.husky'), { recursive: true })
    await writeFile(
      preCommitPath(tmpDir),
      '#!/bin/sh\n# webpresso audit hooks (staged mode — fast)\nwp audit no-dev-vars\nwp audit absolute-path-policy --root .\nwp audit secret-provider-quarantine\n',
      'utf8',
    )

    const result = scaffoldAuditHooks({ repoRoot: tmpDir, options: {} })
    expect(result.action).toBe('appended')

    const content = await readFile(preCommitPath(tmpDir), 'utf8')
    expect(content).toContain('wp format || exit 1')
    expect(content).toContain('git add -- "$file"')
    expect(content).toContain('md|mdx')
    expect(content).toContain('|| exit 1')
    expect((content.match(/wp audit no-dev-vars/g) ?? []).length).toStrictEqual(2)
  })

  it('formats staged files and re-stages formatter rewrites before commit', async () => {
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir })
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })

    const fakeBin = path.join(tmpDir, 'fake-bin')
    await mkdir(fakeBin, { recursive: true })
    const fakeWp = path.join(fakeBin, 'wp')
    await writeFile(
      fakeWp,
      [
        '#!/bin/sh',
        'if [ "$1" = "format" ]; then',
        '  printf "%s\\n" "const formatted = true" > src/example.ts',
        '  exit 0',
        'fi',
        'if [ "$1" = "audit" ]; then exit 0; fi',
        'exit 1',
        '',
      ].join('\n'),
      'utf8',
    )
    await chmod(fakeWp, 0o755)

    await mkdir(path.join(tmpDir, 'src'), { recursive: true })
    await writeFile(path.join(tmpDir, 'src', 'example.ts'), 'const unformatted=true\n', 'utf8')
    execFileSync('git', ['add', 'src/example.ts'], { cwd: tmpDir })
    scaffoldAuditHooks({ repoRoot: tmpDir, options: {} })

    execFileSync('sh', [preCommitPath(tmpDir)], {
      cwd: tmpDir,
      env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}` },
    })

    const stagedDiff = execFileSync('git', ['diff', '--cached', '--', 'src/example.ts'], {
      cwd: tmpDir,
      encoding: 'utf8',
    })
    const unstagedDiff = execFileSync('git', ['diff', '--', 'src/example.ts'], {
      cwd: tmpDir,
      encoding: 'utf8',
    })
    expect(stagedDiff).toContain('const formatted = true')
    expect(unstagedDiff).toBe('')
  }, 30_000)

  it('is idempotent on a file that had the old dead verbs — does not add them again', async () => {
    // Existing hooks may still have old lines from previous wp setup runs
    await mkdir(path.join(tmpDir, '.husky'), { recursive: true })
    await writeFile(
      preCommitPath(tmpDir),
      '#!/bin/sh\n# webpresso audit hooks (staged mode — fast)\nwp audit skill-sizes --staged\nwp audit broken-refs --staged\n',
      'utf8',
    )

    const result = scaffoldAuditHooks({ repoRoot: tmpDir, options: {} })
    // The real audits are absent (only dead verbs), so the managed block is appended.
    expect(result.action).toBe('appended')

    const content = await readFile(preCommitPath(tmpDir), 'utf8')
    // Dead verbs are preserved (we never remove content) and not re-added.
    expect(content).toContain('wp audit skill-sizes')
    expect((content.match(/wp audit skill-sizes/g) ?? []).length).toStrictEqual(1)
    // The real, staged-gated audits are now present.
    expect(content).toContain('wp audit no-dev-vars')
    expect(content).toContain('wp audit absolute-path-policy --root .')
    expect(content).toContain('wp audit secret-provider-quarantine')
    expect(content).toContain('git diff --cached --name-only --diff-filter=ACMR')
  })

  it('skips writes in dry-run mode', async () => {
    const result = scaffoldAuditHooks({ repoRoot: tmpDir, options: { dryRun: true } })
    expect(result.action).toBe('skipped-dry')
    expect(existsSync(preCommitPath(tmpDir))).toBe(false)
  })

  it('creates .husky dir when it does not exist', async () => {
    // No .husky dir; should be created automatically
    expect(existsSync(path.join(tmpDir, '.husky'))).toBe(false)
    scaffoldAuditHooks({ repoRoot: tmpDir, options: {} })
    expect(existsSync(path.join(tmpDir, '.husky'))).toBe(true)
  })
})
