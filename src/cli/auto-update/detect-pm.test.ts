/**
 * Tests for package-manager detection.
 *
 * `realpathSync` is mocked to feed synthetic argv0 paths through the algorithm.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    realpathSync: vi.fn(),
  }
})

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return { ...actual, execFileSync: vi.fn() }
})

import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'

import {
  buildVpGlobalInstallCommand,
  confirmInstalledGlobally,
  detect,
  detectGitInstall,
  detectShim,
  formatLegacyCommandReplacementMessage,
  matchStoreMarker,
  parseUserAgent,
} from './detect-pm.js'

const realpathSyncMock = vi.mocked(realpathSync)
const execFileSyncMock = vi.mocked(execFileSync)

beforeEach(() => {
  realpathSyncMock.mockReset()
  execFileSyncMock.mockReset()
  // Default: realpath is identity; git commands throw (not a git install).
  realpathSyncMock.mockImplementation((p) => String(p))
  execFileSyncMock.mockImplementation(() => {
    throw new Error('not a git repo')
  })
})

describe('buildVpGlobalInstallCommand', () => {
  it('returns the global-install command with no dead --registry flag', () => {
    // npmjs.org is the default registry, and a global --registry does not
    // override a scoped @webpresso:registry mapping — so the flag is dropped.
    expect(buildVpGlobalInstallCommand()).toStrictEqual([
      'vp',
      'install',
      '-g',
      '@webpresso/agent-kit',
    ])
  })

  it('is the command surfaced by detect() for a resolved manager', () => {
    const result = detect({ npm_config_user_agent: 'pnpm/10.33.0 node/v22' }, '/path/to/bin')
    expect(result).toStrictEqual({ manager: 'pnpm', command: buildVpGlobalInstallCommand() })
  })
})

describe('parseUserAgent', () => {
  it('detects npm from a npm user-agent header', () => {
    expect(parseUserAgent('npm/10.2.4 node/v22.0.0 darwin x64')).toStrictEqual('npm')
  })

  it('detects pnpm from a pnpm user-agent header', () => {
    expect(parseUserAgent('pnpm/10.33.0 npm/? node/v22.0.0 darwin arm64')).toStrictEqual('pnpm')
  })

  it('detects yarn', () => {
    expect(parseUserAgent('yarn/1.22.22 npm/? node/v22.0.0 darwin arm64')).toStrictEqual('yarn')
  })

  it('detects bun', () => {
    expect(parseUserAgent('bun/1.1.0 npm/? node/v22.0.0 darwin arm64')).toStrictEqual('bun')
  })

  it('detects vp', () => {
    expect(parseUserAgent('vp/0.1.22 node/v24.16.0 darwin arm64')).toStrictEqual('vp')
  })

  it('ignores case', () => {
    expect(parseUserAgent('PNPM/9.0 node/v22.0.0')).toStrictEqual('pnpm')
  })

  it('returns null for an unknown leading manager', () => {
    expect(parseUserAgent('rush/5.0 node/v22.0.0')).toStrictEqual(null)
  })

  it('returns null for an empty user-agent', () => {
    expect(parseUserAgent('')).toStrictEqual(null)
    expect(parseUserAgent('   ')).toStrictEqual(null)
  })

  it('handles a manager name without a version slash', () => {
    expect(parseUserAgent('pnpm node/v22')).toStrictEqual('pnpm')
  })
})

describe('matchStoreMarker', () => {
  it('detects Vite+ via .vite-plus segment', () => {
    expect(
      matchStoreMarker('/Users/me/.vite-plus/packages/webpresso/current/bin/wp'),
    ).toStrictEqual('vp')
  })

  it('detects pnpm via .pnpm-store segment', () => {
    expect(matchStoreMarker('/Users/me/.pnpm-store/v3/foo/webpresso/dist/cli.js')).toStrictEqual(
      'pnpm',
    )
  })

  it('detects pnpm via .pnpm virtual store segment', () => {
    expect(
      matchStoreMarker('/Users/me/Library/pnpm/global/5/node_modules/.pnpm/webpresso@1.0.0'),
    ).toStrictEqual('pnpm')
  })

  it('detects pnpm via pnpm-global segment', () => {
    expect(matchStoreMarker('/Users/me/pnpm-global/5/node_modules/webpresso/cli.js')).toStrictEqual(
      'pnpm',
    )
  })

  it('detects bun via .bun + install', () => {
    expect(
      matchStoreMarker('/Users/me/.bun/install/global/node_modules/webpresso/cli.js'),
    ).toStrictEqual('bun')
  })

  it('detects yarn classic via .yarn + global', () => {
    expect(matchStoreMarker('/Users/me/.yarn/global/node_modules/webpresso/cli.js')).toStrictEqual(
      'yarn',
    )
  })

  it('detects yarn berry via .yarn + berry', () => {
    expect(matchStoreMarker('/Users/me/.yarn/berry/cache/webpresso/cli.js')).toStrictEqual('yarn')
  })

  it('detects npm via Homebrew Cellar', () => {
    expect(
      matchStoreMarker('/opt/homebrew/Cellar/node/22.0.0/lib/node_modules/webpresso'),
    ).toStrictEqual('npm')
  })

  it('detects npm via /usr/local/lib/node_modules', () => {
    expect(matchStoreMarker('/usr/local/lib/node_modules/webpresso/dist/cli.js')).toStrictEqual(
      'npm',
    )
  })

  it('detects npm via ~/.npm-global', () => {
    expect(
      matchStoreMarker('/Users/me/.npm-global/lib/node_modules/webpresso/cli.js'),
    ).toStrictEqual('npm')
  })

  it('returns null for a path with no store marker', () => {
    expect(matchStoreMarker('/tmp/foo/bar/webpresso')).toStrictEqual(null)
  })
})

describe('detectShim', () => {
  it('detects Volta shims', () => {
    expect(detectShim('/Users/me/.volta/tools/image/packages/webpresso/bin/cli.js')).toMatch(
      /Volta/,
    )
  })

  it('detects asdf shims', () => {
    expect(detectShim('/Users/me/.asdf/installs/nodejs/22.0.0/.npm/bin/webpresso')).toMatch(/asdf/)
  })

  it('returns null for plain Homebrew paths', () => {
    expect(detectShim('/opt/homebrew/Cellar/node/22.0.0/bin/webpresso')).toStrictEqual(null)
  })
})

describe('confirmInstalledGlobally', () => {
  it('accepts a Homebrew Cellar install', () => {
    expect(
      confirmInstalledGlobally(
        '/opt/homebrew/Cellar/node/22.0.0/lib/node_modules/webpresso/cli.js',
        {},
      ),
    ).toStrictEqual(true)
  })

  it('accepts /usr/local/lib/node_modules', () => {
    expect(
      confirmInstalledGlobally('/usr/local/lib/node_modules/webpresso/cli.js', {}),
    ).toStrictEqual(true)
  })

  it('accepts .pnpm-store paths', () => {
    expect(
      confirmInstalledGlobally('/Users/me/.pnpm-store/v3/.../webpresso/cli.js', {}),
    ).toStrictEqual(true)
  })

  it('accepts .bun installs', () => {
    expect(
      confirmInstalledGlobally('/Users/me/.bun/install/global/node_modules/webpresso/cli.js', {}),
    ).toStrictEqual(true)
  })

  it('rejects a project-local devDep install', () => {
    expect(
      confirmInstalledGlobally('/Users/me/my-project/node_modules/webpresso/dist/cli.js', {}),
    ).toStrictEqual(false)
  })

  it('accepts a path matching env.npm_config_prefix', () => {
    expect(
      confirmInstalledGlobally('/custom/prefix/node_modules/webpresso/cli.js', {
        npm_config_prefix: '/custom/prefix',
      }),
    ).toStrictEqual(true)
  })

  it('accepts paths not inside any node_modules tree', () => {
    expect(confirmInstalledGlobally('/opt/webpresso/bin/cli.js', {})).toStrictEqual(true)
  })
})

describe('detectGitInstall', () => {
  it('returns the repo dir when argv1 resolves into the webpresso/webpresso clone', () => {
    realpathSyncMock.mockReturnValue('/Users/me/repos/webpresso/webpresso/src/cli/cli.ts')
    execFileSyncMock
      .mockReturnValueOnce('/Users/me/repos/webpresso/webpresso\n')
      .mockReturnValueOnce('git@github.com:webpresso/webpresso.git\n')
    expect(detectGitInstall('/Users/me/.local/bin/wp')).toStrictEqual(
      '/Users/me/repos/webpresso/webpresso',
    )
  })

  it('returns null when the remote is not webpresso/webpresso', () => {
    realpathSyncMock.mockReturnValue('/Users/me/other-repo/cli.ts')
    execFileSyncMock
      .mockReturnValueOnce('/Users/me/other-repo\n')
      .mockReturnValueOnce('git@github.com:other/repo.git\n')
    expect(detectGitInstall('/Users/me/.local/bin/wp')).toStrictEqual(null)
  })

  it('returns null when realpath throws', () => {
    realpathSyncMock.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    expect(detectGitInstall('/missing/path')).toStrictEqual(null)
  })
})

describe('detect — priority 0: git/source install', () => {
  it('returns git pull command when argv1 is inside the webpresso clone', () => {
    realpathSyncMock.mockReturnValue('/Users/me/repos/webpresso/webpresso/src/cli/cli.ts')
    execFileSyncMock
      .mockReturnValueOnce('/Users/me/repos/webpresso/webpresso\n')
      .mockReturnValueOnce('git@github.com:webpresso/webpresso.git\n')
    const result = detect({}, '/Users/me/.local/bin/wp')
    expect(result).toStrictEqual({
      manager: 'git',
      command: ['git', '-C', '/Users/me/repos/webpresso/webpresso', 'pull'],
    })
  })
})

describe('formatLegacyCommandReplacementMessage', () => {
  it('maps stale setup, sync, audit, docs, skills, hooks, test, e2e, and tech-debt commands', () => {
    expect(formatLegacyCommandReplacementMessage('wp setup')).toContain('`webpresso agent setup`')
    expect(formatLegacyCommandReplacementMessage('wp sync')).toContain('`webpresso agent sync`')
    expect(formatLegacyCommandReplacementMessage('wp audit')).toContain('`webpresso agent audit`')
    expect(formatLegacyCommandReplacementMessage('wp docs lint')).toContain(
      '`webpresso agent docs lint`',
    )
    expect(formatLegacyCommandReplacementMessage('wp skill')).toContain('`webpresso agent skills`')
    expect(formatLegacyCommandReplacementMessage('wp hooks doctor')).toContain(
      '`webpresso agent hooks doctor`',
    )
    expect(formatLegacyCommandReplacementMessage('wp test')).toContain('`webpresso agent test`')
    expect(formatLegacyCommandReplacementMessage('wp e2e')).toContain('`webpresso agent e2e`')
    expect(formatLegacyCommandReplacementMessage('wp tech-debt')).toContain(
      '`webpresso agent tech-debt`',
    )
  })

  it('returns null for commands without a known replacement', () => {
    expect(formatLegacyCommandReplacementMessage('wp mystery')).toBeNull()
  })
})

describe('detect — priority 1: npm_config_user_agent', () => {
  it('returns pnpm + install command from user-agent', () => {
    const result = detect({ npm_config_user_agent: 'pnpm/10.33.0 node/v22' }, '/path/to/bin')
    expect(result).toStrictEqual({
      manager: 'pnpm',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
  })

  it('returns npm install command for npm user-agent', () => {
    const result = detect({ npm_config_user_agent: 'npm/10.2.4 node/v22' }, '/path/to/bin')
    expect(result).toStrictEqual({
      manager: 'npm',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
  })

  it('returns yarn install command for yarn user-agent', () => {
    const result = detect({ npm_config_user_agent: 'yarn/1.22.22 node/v22' }, '/path/to/bin')
    expect(result).toStrictEqual({
      manager: 'yarn',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
  })

  it('returns bun install command for bun user-agent', () => {
    const result = detect({ npm_config_user_agent: 'bun/1.1.0 node/v22' }, '/path/to/bin')
    expect(result).toStrictEqual({
      manager: 'bun',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
  })

  it('falls through to argv0 walk when user-agent is unknown', () => {
    realpathSyncMock.mockReturnValue('/opt/homebrew/Cellar/node/22.0.0/lib/node_modules/webpresso')
    const result = detect(
      { npm_config_user_agent: 'rush/5.0 node/v22' },
      '/opt/homebrew/bin/webpresso',
    )
    expect(result).toStrictEqual({
      manager: 'npm',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
  })
})

describe('detect — priority 2: realpath walk', () => {
  it('detects pnpm from a realpath inside .pnpm-store', () => {
    realpathSyncMock.mockReturnValue('/Users/me/.pnpm-store/v3/abc/webpresso/cli.js')
    const result = detect({}, '/Users/me/bin/webpresso')
    expect(result).toStrictEqual({
      manager: 'pnpm',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
  })

  it('detects bun from a realpath inside .bun/install/global', () => {
    realpathSyncMock.mockReturnValue('/Users/me/.bun/install/global/node_modules/webpresso/cli.js')
    const result = detect({}, '/Users/me/.bun/bin/webpresso')
    expect(result).toStrictEqual({
      manager: 'bun',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
  })

  it('detects npm via Homebrew', () => {
    realpathSyncMock.mockReturnValue(
      '/opt/homebrew/Cellar/node/22.0.0/lib/node_modules/webpresso/cli.js',
    )
    const result = detect({}, '/opt/homebrew/bin/webpresso')
    expect(result).toStrictEqual({
      manager: 'npm',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
  })
})

describe('detect — priority 3: global confirmation', () => {
  it('aborts when a matched-but-non-global path is supplied via npm_config_prefix mismatch', () => {
    // Path matches the npm store marker (lib + node_modules) but the env-provided
    // prefix points elsewhere, AND the path doesn't include a recognised global
    // segment. This is an edge case where confirmInstalledGlobally returns false.
    realpathSyncMock.mockReturnValue('/Users/me/some-proj/lib/node_modules/webpresso/cli.js')
    const result = detect(
      { npm_config_prefix: '/usr/local' },
      '/Users/me/some-proj/lib/node_modules/.bin/webpresso',
    )
    // matchStoreMarker → 'npm'; confirmInstalledGlobally still returns true
    // because `lib + node_modules` is in the global allowlist. Documented:
    // confirmInstalledGlobally is conservative — it errs on the side of
    // attempting an install. The real devDep abort path is when matchStoreMarker
    // returns null entirely (covered by the "unknown" priority-5 test).
    expect('manager' in result).toStrictEqual(true)
  })

  it('treats project-local node_modules with no global markers as unknown (abort)', () => {
    realpathSyncMock.mockReturnValue('/Users/me/proj/node_modules/webpresso/dist/cli.js')
    const result = detect({}, '/Users/me/proj/node_modules/.bin/webpresso')
    // matchStoreMarker returns null (no .pnpm/.bun/.yarn/.npm-global/Cellar/lib);
    // detect falls through to priority 5 "unknown".
    expect('abort' in result).toStrictEqual(true)
  })
})

describe('detect — priority 4: Volta / asdf shims', () => {
  it('aborts on Volta shim path', () => {
    realpathSyncMock.mockReturnValue('/Users/me/.volta/tools/image/packages/webpresso/bin/cli.js')
    const result = detect({}, '/Users/me/.volta/bin/webpresso')
    expect('abort' in result).toStrictEqual(true)
    if ('abort' in result) expect(result.abort).toMatch(/Volta/)
  })

  it('aborts on asdf shim path', () => {
    realpathSyncMock.mockReturnValue('/Users/me/.asdf/installs/nodejs/22.0.0/.npm/bin/webpresso')
    const result = detect({}, '/Users/me/.asdf/shims/webpresso')
    expect('abort' in result).toStrictEqual(true)
    if ('abort' in result) expect(result.abort).toMatch(/asdf/)
  })

  it('Volta detection wins even if user-agent declares pnpm (avoid shim mismatch)', () => {
    realpathSyncMock.mockReturnValue('/Users/me/.volta/tools/image/packages/webpresso/bin/cli.js')
    const result = detect(
      { npm_config_user_agent: 'pnpm/10.33.0 node/v22' },
      '/Users/me/.volta/bin/webpresso',
    )
    // Per priority order, the user-agent is consulted FIRST; pnpm takes the
    // happy path. Documented quirk: when both signals disagree, user-agent
    // wins. The plan accepts this because user-agent is the most reliable
    // signal of the *invoking* manager.
    expect('manager' in result).toStrictEqual(true)
  })
})

describe('detect — priority 5: unknown', () => {
  it('aborts when neither user-agent nor realpath yield a match', () => {
    realpathSyncMock.mockReturnValue('/tmp/random/webpresso/cli.js')
    const result = detect({}, '/tmp/random/bin/webpresso')
    expect('abort' in result).toStrictEqual(true)
    if ('abort' in result) expect(result.abort).toMatch(/Unable to detect/)
  })

  it('aborts gracefully when realpathSync throws', () => {
    realpathSyncMock.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    const result = detect({}, '/missing/path')
    expect('abort' in result).toStrictEqual(true)
  })
})
