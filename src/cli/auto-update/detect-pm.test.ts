/**
 * Tests for install-topology detection.
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
    realpathSyncMock.mockReturnValue('/Users/me/.pnpm-store/v3/abc/@webpresso/agent-kit/cli.js')
    const result = detect({ npm_config_user_agent: 'pnpm/10.33.0 node/v22' }, '/path/to/bin')
    expect(result).toStrictEqual({ topology: 'pnpm', command: buildVpGlobalInstallCommand() })
  })
})

describe('parseUserAgent', () => {
  it('detects npm from a npm user-agent header', () => {
    expect(parseUserAgent('npm/10.2.4 node/v22.0.0 darwin x64')).toStrictEqual('global-node')
  })

  it('detects pnpm from a pnpm user-agent header', () => {
    expect(parseUserAgent('pnpm/10.33.0 npm/? node/v22.0.0 darwin arm64')).toStrictEqual('pnpm')
  })

  it('detects yarn', () => {
    expect(parseUserAgent('yarn/1.22.22 npm/? node/v22.0.0 darwin arm64')).toStrictEqual(
      'global-node',
    )
  })

  it('detects bun', () => {
    expect(parseUserAgent('bun/1.1.0 npm/? node/v22.0.0 darwin arm64')).toStrictEqual('global-node')
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
    expect(
      matchStoreMarker('/Users/me/.pnpm-store/v3/foo/@webpresso/agent-kit/dist/cli.js'),
    ).toStrictEqual('pnpm')
  })

  it('detects pnpm via .pnpm virtual store segment', () => {
    expect(
      matchStoreMarker(
        '/Users/me/Library/pnpm/global/5/node_modules/.pnpm/@webpresso+agent-kit@1.0.0',
      ),
    ).toStrictEqual('pnpm')
  })

  it('detects pnpm via pnpm-global segment', () => {
    expect(
      matchStoreMarker('/Users/me/pnpm-global/5/node_modules/@webpresso/agent-kit/cli.js'),
    ).toStrictEqual('pnpm')
  })

  it('detects bun via .bun + install', () => {
    expect(
      matchStoreMarker('/Users/me/.bun/install/global/node_modules/@webpresso/agent-kit/cli.js'),
    ).toStrictEqual('global-node')
  })

  it('detects yarn classic via .yarn + global', () => {
    expect(
      matchStoreMarker('/Users/me/.yarn/global/node_modules/@webpresso/agent-kit/cli.js'),
    ).toStrictEqual('global-node')
  })

  it('detects yarn berry via .yarn + berry', () => {
    expect(
      matchStoreMarker('/Users/me/.yarn/berry/cache/@webpresso/agent-kit/cli.js'),
    ).toStrictEqual('global-node')
  })

  it('detects generic global-node via lib/node_modules', () => {
    expect(matchStoreMarker('/global/node/lib/node_modules/@webpresso/agent-kit')).toStrictEqual(
      'global-node',
    )
  })

  it('detects npm via /usr/local/lib/node_modules', () => {
    expect(
      matchStoreMarker('/usr/local/lib/node_modules/@webpresso/agent-kit/dist/cli.js'),
    ).toStrictEqual('global-node')
  })

  it('detects npm via ~/.npm-global', () => {
    expect(
      matchStoreMarker('/Users/me/.npm-global/lib/node_modules/@webpresso/agent-kit/cli.js'),
    ).toStrictEqual('global-node')
  })

  it('returns null for a path with no store marker', () => {
    expect(matchStoreMarker('/tmp/foo/bar/@webpresso/agent-kit')).toStrictEqual(null)
  })
})

describe('detectShim', () => {
  it('detects Volta shims', () => {
    expect(
      detectShim('/Users/me/.volta/tools/image/packages/@webpresso/agent-kit/bin/cli.js'),
    ).toMatch(/Volta/)
  })

  it('detects asdf shims', () => {
    expect(
      detectShim('/Users/me/.asdf/installs/nodejs/22.0.0/.npm/bin/@webpresso/agent-kit'),
    ).toMatch(/asdf/)
  })

  it('returns null for plain global-node paths', () => {
    expect(detectShim('/global/node/bin/@webpresso/agent-kit')).toStrictEqual(null)
  })
})

describe('confirmInstalledGlobally', () => {
  it('accepts a generic global-node install', () => {
    expect(
      confirmInstalledGlobally('/usr/local/lib/node_modules/@webpresso/agent-kit/cli.js', {}),
    ).toStrictEqual(true)
  })

  it('accepts /usr/local/lib/node_modules', () => {
    expect(
      confirmInstalledGlobally('/usr/local/lib/node_modules/@webpresso/agent-kit/cli.js', {}),
    ).toStrictEqual(true)
  })

  it('accepts .pnpm-store paths', () => {
    expect(
      confirmInstalledGlobally('/Users/me/.pnpm-store/v3/.../@webpresso/agent-kit/cli.js', {}),
    ).toStrictEqual(true)
  })

  it('accepts .bun installs', () => {
    expect(
      confirmInstalledGlobally(
        '/Users/me/.bun/install/global/node_modules/@webpresso/agent-kit/cli.js',
        {},
      ),
    ).toStrictEqual(true)
  })

  it('rejects a project-local devDep install', () => {
    expect(
      confirmInstalledGlobally(
        '/Users/me/my-project/node_modules/@webpresso/agent-kit/dist/cli.js',
        {},
      ),
    ).toStrictEqual(false)
  })

  it('accepts a path matching env.npm_config_prefix', () => {
    expect(
      confirmInstalledGlobally('/custom/prefix/node_modules/@webpresso/agent-kit/cli.js', {
        npm_config_prefix: '/custom/prefix',
      }),
    ).toStrictEqual(true)
  })

  it('accepts paths not inside any node_modules tree', () => {
    expect(confirmInstalledGlobally('/opt/@webpresso/agent-kit/bin/cli.js', {})).toStrictEqual(true)
  })
})

describe('detectGitInstall', () => {
  it('returns the repo dir when argv1 resolves into the webpresso/agent-kit clone', () => {
    realpathSyncMock.mockReturnValue('/Users/me/repos/webpresso/agent-kit/src/cli/cli.ts')
    execFileSyncMock
      .mockReturnValueOnce('/Users/me/repos/webpresso/agent-kit\n')
      .mockReturnValueOnce('git@github.com:webpresso/agent-kit.git\n')
    expect(detectGitInstall('/Users/me/.local/bin/wp')).toStrictEqual(
      '/Users/me/repos/webpresso/agent-kit',
    )
  })

  it('returns null when the remote is not webpresso/agent-kit', () => {
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
  it('returns git pull command when argv1 is inside the agent-kit clone', () => {
    realpathSyncMock.mockReturnValue('/Users/me/repos/webpresso/agent-kit/src/cli/cli.ts')
    execFileSyncMock
      .mockReturnValueOnce('/Users/me/repos/webpresso/agent-kit\n')
      .mockReturnValueOnce('git@github.com:webpresso/agent-kit.git\n')
    const result = detect({}, '/Users/me/.local/bin/wp')
    expect(result).toStrictEqual({
      topology: 'git',
      command: ['git', '-C', '/Users/me/repos/webpresso/agent-kit', 'pull'],
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
    realpathSyncMock.mockReturnValue('/Users/me/.pnpm-store/v3/abc/@webpresso/agent-kit/cli.js')
    const result = detect({ npm_config_user_agent: 'pnpm/10.33.0 node/v22' }, '/path/to/bin')
    expect(result).toStrictEqual({
      topology: 'pnpm',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
  })

  it('collapses npm user-agent into generic global-node topology', () => {
    realpathSyncMock.mockReturnValue('/usr/local/lib/node_modules/@webpresso/agent-kit/cli.js')
    const result = detect({ npm_config_user_agent: 'npm/10.2.4 node/v22' }, '/path/to/bin')
    expect(result).toStrictEqual({
      topology: 'global-node',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
  })

  it('collapses yarn user-agent into generic global-node topology', () => {
    realpathSyncMock.mockReturnValue('/usr/local/lib/node_modules/@webpresso/agent-kit/cli.js')
    const result = detect({ npm_config_user_agent: 'yarn/1.22.22 node/v22' }, '/path/to/bin')
    expect(result).toStrictEqual({
      topology: 'global-node',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
  })

  it('collapses bun user-agent into generic global-node topology', () => {
    const result = detect({ npm_config_user_agent: 'bun/1.1.0 node/v22' }, '/path/to/bin')
    expect('abort' in result).toStrictEqual(true)
  })

  it('falls through to argv0 walk when user-agent is unknown', () => {
    realpathSyncMock.mockReturnValue('/usr/local/lib/node_modules/@webpresso/agent-kit')
    const result = detect({ npm_config_user_agent: 'rush/5.0 node/v22' }, '/usr/local/bin/wp')
    expect(result).toStrictEqual({
      topology: 'global-node',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
  })

  it('does not trust transient exec wrappers from user-agent alone', () => {
    expect(parseUserAgent('npx/10.2.4 node/v22')).toStrictEqual(null)
    expect(parseUserAgent('pnpx/10.2.4 node/v22')).toStrictEqual(null)
    expect(parseUserAgent('bunx/1.1.0 node/v22')).toStrictEqual(null)
  })
})

describe('detect — priority 2: realpath walk', () => {
  it('detects pnpm from a realpath inside .pnpm-store', () => {
    realpathSyncMock.mockReturnValue('/Users/me/.pnpm-store/v3/abc/@webpresso/agent-kit/cli.js')
    const result = detect({}, '/Users/me/bin/wp')
    expect(result).toStrictEqual({
      topology: 'pnpm',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
  })

  it('detects generic global-node from a realpath inside .bun/install/global', () => {
    realpathSyncMock.mockReturnValue(
      '/Users/me/.bun/install/global/node_modules/@webpresso/agent-kit/cli.js',
    )
    const result = detect({}, '/Users/me/.bun/bin/wp')
    expect(result).toStrictEqual({
      topology: 'global-node',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
  })

  it('detects generic global-node via lib/node_modules', () => {
    realpathSyncMock.mockReturnValue('/usr/local/lib/node_modules/@webpresso/agent-kit/cli.js')
    const result = detect({}, '/usr/local/bin/wp')
    expect(result).toStrictEqual({
      topology: 'global-node',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
  })
})

describe('detect — priority 3: global confirmation', () => {
  it('aborts when a matched-but-non-global path is supplied via npm_config_prefix mismatch', () => {
    // Path matches the global-node marker shape (lib + node_modules) but the
    // env-provided prefix points elsewhere, and the path is not under a known
    // global prefix such as /usr/local or /opt/homebrew.
    realpathSyncMock.mockReturnValue(
      '/Users/me/some-proj/lib/node_modules/@webpresso/agent-kit/cli.js',
    )
    const result = detect(
      { npm_config_prefix: '/usr/local' },
      '/Users/me/some-proj/lib/node_modules/.bin/wp',
    )
    expect('abort' in result).toStrictEqual(true)
  })

  it('treats project-local node_modules with no global markers as unknown (abort)', () => {
    realpathSyncMock.mockReturnValue('/Users/me/proj/node_modules/@webpresso/agent-kit/dist/cli.js')
    const result = detect({}, '/Users/me/proj/node_modules/.bin/wp')
    // matchStoreMarker returns null (no .pnpm/.bun/.yarn/.npm-global/global-node marker);
    // detect falls through to priority 5 "unknown".
    expect('abort' in result).toStrictEqual(true)
  })
})

describe('detect — priority 4: Volta / asdf shims', () => {
  it('aborts on Volta shim path', () => {
    realpathSyncMock.mockReturnValue(
      '/Users/me/.volta/tools/image/packages/@webpresso/agent-kit/bin/cli.js',
    )
    const result = detect({}, '/Users/me/.volta/bin/wp')
    expect('abort' in result).toStrictEqual(true)
    if ('abort' in result) expect(result.abort).toMatch(/Volta/)
  })

  it('aborts on asdf shim path', () => {
    realpathSyncMock.mockReturnValue(
      '/Users/me/.asdf/installs/nodejs/22.0.0/.npm/bin/@webpresso/agent-kit',
    )
    const result = detect({}, '/Users/me/.asdf/shims/wp')
    expect('abort' in result).toStrictEqual(true)
    if ('abort' in result) expect(result.abort).toMatch(/asdf/)
  })

  it('Volta detection wins even if user-agent declares pnpm (avoid shim mismatch)', () => {
    realpathSyncMock.mockReturnValue(
      '/Users/me/.volta/tools/image/packages/@webpresso/agent-kit/bin/cli.js',
    )
    const result = detect(
      { npm_config_user_agent: 'pnpm/10.33.0 node/v22' },
      '/Users/me/.volta/bin/wp',
    )
    expect('abort' in result).toStrictEqual(true)
    if ('abort' in result) expect(result.abort).toMatch(/Volta/)
  })
})

describe('detect — priority 5: unknown', () => {
  it('aborts when neither user-agent nor realpath yield a match', () => {
    realpathSyncMock.mockReturnValue('/tmp/random/@webpresso/agent-kit/cli.js')
    const result = detect({}, '/tmp/random/bin/wp')
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
