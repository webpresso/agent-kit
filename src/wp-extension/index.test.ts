import { describe, expect, it } from 'vitest'

import {
  isWpExtensionV1,
  loadWpExtensions,
  resolveAcceptedExtensionAliases,
  type WpExtensionV1,
} from './index.js'

function makeExtension(overrides: Partial<WpExtensionV1> = {}): WpExtensionV1 {
  return {
    apiVersion: '1',
    name: 'framework',
    version: '1.0.0',
    hostRange: '^0.1.0',
    detect: () => true,
    commands: [
      {
        name: 'project',
        description: 'Project command',
        register: () => {},
      },
    ],
    aliases: [{ name: 'dev', commandName: 'project' }],
    ...overrides,
  }
}

describe('wp extension runtime helpers', () => {
  it('validates the extension shape', () => {
    expect(isWpExtensionV1(makeExtension())).toBe(true)
    expect(isWpExtensionV1({})).toBe(false)
  })

  it('discovers and loads compatible extensions from dependency manifests', async () => {
    const loaded = await loadWpExtensions({
      cwd: '/repo',
      hostVersion: '0.1.5',
      readJsonFile: (path) => {
        if (path === '/repo/package.json') {
          return { dependencies: { '@webpresso/webpresso': 'workspace:*' } }
        }
        if (path === '/deps/framework/package.json') {
          return { webpresso: { wpExtension: '@webpresso/webpresso/wp-extension' } }
        }
        return undefined
      },
      resolveFrom: (from, specifier) => {
        if (from === '/repo/package.json' && specifier === '@webpresso/webpresso/package.json') {
          return '/deps/framework/package.json'
        }
        if (
          from === '/deps/framework/package.json' &&
          specifier === '@webpresso/webpresso/wp-extension'
        ) {
          return '/deps/framework/wp-extension.js'
        }
        throw new Error(`unexpected resolve: ${from} -> ${specifier}`)
      },
      importModule: async (specifier) => {
        expect(specifier).toBe('/deps/framework/wp-extension.js')
        return { default: makeExtension() }
      },
    })

    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toMatchObject({
      packageName: '@webpresso/webpresso',
      compatible: true,
      detected: true,
      warnings: [],
    })
  })

  it('warns when the host version does not satisfy the extension range', async () => {
    const loaded = await loadWpExtensions({
      cwd: '/repo',
      hostVersion: '0.2.0',
      readJsonFile: (path) => {
        if (path === '/repo/package.json') return { dependencies: { framework: '1.0.0' } }
        if (path === '/deps/framework/package.json') {
          return { webpresso: { wpExtension: 'framework/wp-extension' } }
        }
        return undefined
      },
      resolveFrom: (from, specifier) => {
        if (from === '/repo/package.json' && specifier === 'framework/package.json') {
          return '/deps/framework/package.json'
        }
        if (from === '/deps/framework/package.json' && specifier === 'framework/wp-extension') {
          return '/deps/framework/wp-extension.js'
        }
        throw new Error(`unexpected resolve: ${from} -> ${specifier}`)
      },
      importModule: async () => ({ default: makeExtension({ hostRange: '^0.1.0' }) }),
    })

    expect(loaded[0]?.compatible).toBe(false)
    expect(loaded[0]?.warnings[0]).toContain('requires host ^0.1.0')
  })

  it('skips alias collisions against base commands and earlier extensions', () => {
    const first = {
      packageName: 'framework-a',
      specifier: 'a',
      extension: makeExtension(),
      compatible: true,
      detected: true,
      warnings: [],
    }
    const second = {
      packageName: 'framework-b',
      specifier: 'b',
      extension: makeExtension({
        aliases: [
          { name: 'dev', commandName: 'project' },
          { name: 'build', commandName: 'project' },
        ],
      }),
      compatible: true,
      detected: true,
      warnings: [],
    }

    const result = resolveAcceptedExtensionAliases(
      [first, second],
      ['project', 'build'],
      ['project'],
    )

    expect([...result.aliases.keys()]).toEqual(['dev'])
    expect(result.warnings).toEqual([
      'framework-b: skipped alias "dev" because another extension already claimed it',
      'framework-b: skipped alias "build" because it collides with an existing wp command',
    ])
  })

  it('surfaces invalid extension modules as warnings', async () => {
    const loaded = await loadWpExtensions({
      cwd: '/repo',
      hostVersion: '0.1.5',
      readJsonFile: (path) => {
        if (path === '/repo/package.json') return { dependencies: { framework: '1.0.0' } }
        if (path === '/deps/framework/package.json')
          return { webpresso: { wpExtension: 'framework/wp-extension' } }
        return undefined
      },
      resolveFrom: (from, specifier) => {
        if (from === '/repo/package.json' && specifier === 'framework/package.json') {
          return '/deps/framework/package.json'
        }
        if (from === '/deps/framework/package.json' && specifier === 'framework/wp-extension') {
          return '/deps/framework/wp-extension.js'
        }
        throw new Error(`unexpected resolve: ${from} -> ${specifier}`)
      },
      importModule: async () => ({ default: { nope: true } }),
    })

    expect(loaded[0]?.warnings[0]).toContain('default-export a WpExtensionV1 object')
  })

  it('surfaces detect failures as warnings and keeps host startup resilient', async () => {
    const loaded = await loadWpExtensions({
      cwd: '/repo',
      hostVersion: '0.1.5',
      readJsonFile: (path) => {
        if (path === '/repo/package.json') return { dependencies: { framework: '1.0.0' } }
        if (path === '/deps/framework/package.json') {
          return { webpresso: { wpExtension: 'framework/wp-extension' } }
        }
        return undefined
      },
      resolveFrom: (from, specifier) => {
        if (from === '/repo/package.json' && specifier === 'framework/package.json') {
          return '/deps/framework/package.json'
        }
        if (from === '/deps/framework/package.json' && specifier === 'framework/wp-extension') {
          return '/deps/framework/wp-extension.js'
        }
        throw new Error(`unexpected resolve: ${from} -> ${specifier}`)
      },
      importModule: async () => ({
        default: makeExtension({
          detect: () => {
            throw new Error('boom')
          },
        }),
      }),
    })

    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toMatchObject({
      packageName: 'framework',
      compatible: true,
      detected: false,
    })
    expect(loaded[0]?.warnings[0]).toContain('detect() threw')
  })
})
