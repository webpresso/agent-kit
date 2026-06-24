import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildGithubReleaseNotes,
  extractChangesetVersionSection,
  resolveChangelogPath,
} from './github-release-notes.js'

describe('github release notes', () => {
  it('extracts the exact Changesets version section from a changelog', () => {
    const changelog = [
      '# Changelog',
      '',
      '## 2.1.0',
      '',
      '### Minor Changes',
      '',
      '- abc123: New feature.',
      '',
      '## 2.0.5',
      '',
      '- older',
    ].join('\n')

    expect(extractChangesetVersionSection(changelog, '2.1.0')).toBe(
      ['### Minor Changes', '', '- abc123: New feature.'].join('\n'),
    )
  })

  it('builds root release notes with Changesets information and runtime asset context', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-release-notes-'))
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: '@webpresso/agent-kit' }),
      'utf8',
    )
    writeFileSync(
      join(root, 'CHANGELOG.md'),
      ['# Changelog', '', '## 3.0.0', '', '### Patch Changes', '', '- def456: Fix hooks.'].join(
        '\n',
      ),
      'utf8',
    )

    const notes = buildGithubReleaseNotes({
      cwd: root,
      includeRuntimeAssets: true,
      packageName: '@webpresso/agent-kit',
      version: '3.0.0',
    })

    expect(notes).toContain('@webpresso/agent-kit v3.0.0 is published to npm.')
    expect(notes).toContain('## Changeset version information')
    expect(notes).toContain('### Patch Changes')
    expect(notes).toContain('- def456: Fix hooks.')
    expect(notes).toContain('## Native runtime binaries')
  })

  it('builds workspace package notes from the package changelog', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-release-notes-'))
    const packageDir = join(root, 'packages', 'agent-config')
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: '@webpresso/agent-kit' }),
      'utf8',
    )
    writeFileSync(
      join(packageDir, 'package.json'),
      JSON.stringify({ name: '@webpresso/agent-config' }),
      'utf8',
    )
    writeFileSync(
      join(packageDir, 'CHANGELOG.md'),
      [
        '# @webpresso/agent-config',
        '',
        '## 0.2.0',
        '',
        '### Minor Changes',
        '',
        '- abc111: Add preset.',
      ].join('\n'),
      'utf8',
    )

    expect(resolveChangelogPath('@webpresso/agent-config', root)).toBe(
      join(packageDir, 'CHANGELOG.md'),
    )
    expect(
      buildGithubReleaseNotes({
        cwd: root,
        packageName: '@webpresso/agent-config',
        version: '0.2.0',
      }),
    ).toContain('- abc111: Add preset.')
  })

  it('writes notes through the CLI --out path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-release-notes-'))
    const out = join(root, 'notes.md')
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: '@webpresso/agent-kit' }),
      'utf8',
    )
    writeFileSync(
      join(root, 'CHANGELOG.md'),
      ['# Changelog', '', '## 1.2.3', '', '### Patch Changes', '', '- abc123: CLI output.'].join(
        '\n',
      ),
      'utf8',
    )

    const result = spawnSync(
      'bun',
      [
        join(process.cwd(), 'scripts', 'github-release-notes.ts'),
        '--cwd',
        root,
        '--package',
        '@webpresso/agent-kit',
        '--version',
        '1.2.3',
        '--out',
        out,
      ],
      { encoding: 'utf8' },
    )

    expect(result.status, result.stderr).toBe(0)

    expect(readFileSync(out, 'utf8')).toContain('- abc123: CLI output.')
  })
})
