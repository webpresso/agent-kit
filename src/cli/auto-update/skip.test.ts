/**
 * Tests for the auto-update skip-decision module.
 */

import { describe, expect, it } from 'vitest'

import { shouldSkipAutoInstall, shouldSkipUpdateCheck } from './skip.js'

// Synthetic argv shape matches `process.argv`: [runtime, script, ...rest].
function argv(...rest: string[]): string[] {
  return ['/usr/bin/bun', '/path/to/cli.ts', ...rest]
}

describe('shouldSkipUpdateCheck — informational flags', () => {
  it('returns true for --version', () => {
    expect(shouldSkipUpdateCheck({}, argv('--version'))).toStrictEqual(true)
  })

  it('returns true for -v', () => {
    expect(shouldSkipUpdateCheck({}, argv('-v'))).toStrictEqual(true)
  })

  it('returns true for --help', () => {
    expect(shouldSkipUpdateCheck({}, argv('--help'))).toStrictEqual(true)
  })

  it('returns true for -h', () => {
    expect(shouldSkipUpdateCheck({}, argv('-h'))).toStrictEqual(true)
  })

  it('returns true when --version appears after a subcommand', () => {
    expect(shouldSkipUpdateCheck({}, argv('blueprint', '--version'))).toStrictEqual(true)
  })

  it('does not match --version as a substring of another flag', () => {
    expect(shouldSkipUpdateCheck({}, argv('--version-output'))).toStrictEqual(false)
  })

  it('does not match flag names appearing in argv[0] or argv[1]', () => {
    const fakeArgv = ['--version', '--help', 'blueprint', 'list']
    expect(shouldSkipUpdateCheck({}, fakeArgv)).toStrictEqual(false)
  })
})

describe('shouldSkipUpdateCheck — mcp subcommand', () => {
  it('returns true when argv[2] === "mcp"', () => {
    expect(shouldSkipUpdateCheck({}, argv('mcp'))).toStrictEqual(true)
  })

  it('returns true for "mcp" with subarguments', () => {
    expect(shouldSkipUpdateCheck({}, argv('mcp', '--debug'))).toStrictEqual(true)
  })

  it('does not match "mcp" appearing later in argv', () => {
    expect(shouldSkipUpdateCheck({}, argv('blueprint', 'mcp'))).toStrictEqual(false)
  })

  it('does not match "mcp-foo" prefixed subcommands', () => {
    expect(shouldSkipUpdateCheck({}, argv('mcp-server'))).toStrictEqual(false)
  })
})

describe('shouldSkipUpdateCheck — WP_SKIP_UPDATE_CHECK', () => {
  it('returns true when WP_SKIP_UPDATE_CHECK=1', () => {
    expect(shouldSkipUpdateCheck({ WP_SKIP_UPDATE_CHECK: '1' }, argv('blueprint'))).toStrictEqual(
      true,
    )
  })

  it('returns false for other truthy-looking values (strict 1 match only)', () => {
    expect(
      shouldSkipUpdateCheck({ WP_SKIP_UPDATE_CHECK: 'true' }, argv('blueprint')),
    ).toStrictEqual(false)
    expect(shouldSkipUpdateCheck({ WP_SKIP_UPDATE_CHECK: 'yes' }, argv('blueprint'))).toStrictEqual(
      false,
    )
  })

  it('returns false when WP_SKIP_UPDATE_CHECK is unset or empty', () => {
    expect(shouldSkipUpdateCheck({}, argv('blueprint'))).toStrictEqual(false)
    expect(shouldSkipUpdateCheck({ WP_SKIP_UPDATE_CHECK: '' }, argv('blueprint'))).toStrictEqual(
      false,
    )
  })
})

describe('shouldSkipUpdateCheck — CI detection', () => {
  it('returns true for CI=true', () => {
    expect(shouldSkipUpdateCheck({ CI: 'true' }, argv('blueprint'))).toStrictEqual(true)
  })

  it('returns true for CI=1', () => {
    expect(shouldSkipUpdateCheck({ CI: '1' }, argv('blueprint'))).toStrictEqual(true)
  })

  it('returns false for CI=false', () => {
    expect(shouldSkipUpdateCheck({ CI: 'false' }, argv('blueprint'))).toStrictEqual(false)
  })

  it('returns false for CI=0', () => {
    expect(shouldSkipUpdateCheck({ CI: '0' }, argv('blueprint'))).toStrictEqual(false)
  })

  it('returns false for CI=""', () => {
    expect(shouldSkipUpdateCheck({ CI: '' }, argv('blueprint'))).toStrictEqual(false)
  })

  it('returns true for GITHUB_ACTIONS=true even when CI is unset', () => {
    expect(shouldSkipUpdateCheck({ GITHUB_ACTIONS: 'true' }, argv('blueprint'))).toStrictEqual(true)
  })

  it('returns true for GITLAB_CI=true', () => {
    expect(shouldSkipUpdateCheck({ GITLAB_CI: 'true' }, argv('blueprint'))).toStrictEqual(true)
  })

  it('returns true for any non-empty BUILDKITE / CIRCLECI / TRAVIS', () => {
    expect(shouldSkipUpdateCheck({ BUILDKITE: 'true' }, argv('blueprint'))).toStrictEqual(true)
    expect(shouldSkipUpdateCheck({ CIRCLECI: 'true' }, argv('blueprint'))).toStrictEqual(true)
    expect(shouldSkipUpdateCheck({ TRAVIS: 'true' }, argv('blueprint'))).toStrictEqual(true)
  })
})

describe('shouldSkipUpdateCheck — WP_SKIP_AUTO_INSTALL is NOT a skip signal', () => {
  it('returns false when only WP_SKIP_AUTO_INSTALL=1 is set', () => {
    // Per plan: WP_SKIP_AUTO_INSTALL gates only the install side; notify
    // (banner) must still fire. So the broad update-check is not skipped.
    expect(shouldSkipUpdateCheck({ WP_SKIP_AUTO_INSTALL: '1' }, argv('blueprint'))).toStrictEqual(
      false,
    )
  })

  it('still skips when WP_SKIP_AUTO_INSTALL=1 AND a real skip signal is present', () => {
    expect(
      shouldSkipUpdateCheck({ WP_SKIP_AUTO_INSTALL: '1', CI: 'true' }, argv('blueprint')),
    ).toStrictEqual(true)
  })
})

describe('shouldSkipUpdateCheck — happy path', () => {
  it('returns false for a normal interactive subcommand', () => {
    expect(shouldSkipUpdateCheck({}, argv('blueprint', 'list'))).toStrictEqual(false)
  })

  it('returns false when argv has no subcommand at all', () => {
    expect(shouldSkipUpdateCheck({}, argv())).toStrictEqual(false)
  })
})

describe('shouldSkipAutoInstall', () => {
  it('returns true when WP_SKIP_AUTO_INSTALL=1', () => {
    expect(shouldSkipAutoInstall({ WP_SKIP_AUTO_INSTALL: '1' })).toStrictEqual(true)
  })

  it('returns false when WP_SKIP_AUTO_INSTALL is unset', () => {
    expect(shouldSkipAutoInstall({})).toStrictEqual(false)
  })

  it('returns false for WP_SKIP_AUTO_INSTALL=0 or empty', () => {
    expect(shouldSkipAutoInstall({ WP_SKIP_AUTO_INSTALL: '0' })).toStrictEqual(false)
    expect(shouldSkipAutoInstall({ WP_SKIP_AUTO_INSTALL: '' })).toStrictEqual(false)
  })

  it('returns false for other truthy values (strict 1 match only)', () => {
    expect(shouldSkipAutoInstall({ WP_SKIP_AUTO_INSTALL: 'true' })).toStrictEqual(false)
    expect(shouldSkipAutoInstall({ WP_SKIP_AUTO_INSTALL: 'yes' })).toStrictEqual(false)
  })
})
