import type { CAC } from 'cac'

import { describe, expect, it, vi } from 'vitest'

const loadWpExtensions = vi.hoisted(() => vi.fn())
const resolveAcceptedExtensionAliases = vi.hoisted(() => vi.fn())

vi.mock('#wp-extension', () => ({
  loadWpExtensions,
  resolveAcceptedExtensionAliases,
}))

import { registerWpExtensions, resolveWpCommandAlias } from './wp-extensions.js'

describe('registerWpExtensions', () => {
  it('registers detected compatible extension commands and returns alias warnings', async () => {
    const register = vi.fn()
    loadWpExtensions.mockResolvedValueOnce([
      {
        packageName: '@webpresso/framework',
        compatible: true,
        detected: true,
        warnings: [],
        extension: {
          commands: [{ name: 'project', description: 'Project', register }],
        },
      },
    ])
    resolveAcceptedExtensionAliases.mockReturnValueOnce({
      aliases: new Map([['dev', { name: 'dev', commandName: 'project' }]]),
      warnings: ['alias warning'],
    })

    const cli = {} as CAC
    const result = await registerWpExtensions({
      cli,
      cwd: '/repo',
      hostVersion: '0.1.0',
      baseCommands: ['setup'],
    })

    expect(register).toHaveBeenCalledWith(cli)
    expect(result.commandNames).toEqual(['project'])
    expect([...result.aliasMap.keys()]).toEqual(['dev'])
    expect(result.warnings).toEqual(['alias warning'])
  })

  it('keeps extension loader warnings even when nothing is registered', async () => {
    loadWpExtensions.mockResolvedValueOnce([
      {
        packageName: 'broken',
        compatible: false,
        detected: false,
        warnings: ['broken extension'],
      },
    ])
    resolveAcceptedExtensionAliases.mockReturnValueOnce({ aliases: new Map(), warnings: [] })

    const result = await registerWpExtensions({
      cli: {} as CAC,
      cwd: '/repo',
      hostVersion: '0.1.0',
      baseCommands: [],
    })

    expect(result.commandNames).toEqual([])
    expect(result.warnings).toEqual(['broken extension'])
  })

  it('skips extension commands that collide with base and prior extension commands', async () => {
    const command = vi.fn()
    loadWpExtensions.mockResolvedValueOnce([
      {
        packageName: 'ext-a',
        compatible: true,
        detected: true,
        warnings: [],
        extension: {
          commands: [
            { name: 'project', description: 'Project', register: command },
            { name: 'check', description: 'Check', register: command },
          ],
        },
      },
      {
        packageName: 'ext-b',
        compatible: true,
        detected: true,
        warnings: [],
        extension: {
          commands: [{ name: 'project', description: 'Shadow', register: command }],
        },
      },
    ])
    resolveAcceptedExtensionAliases.mockReturnValueOnce({
      aliases: new Map(),
      warnings: [],
      acceptedCommandNames: [],
    })

    const cli = {} as CAC
    const result = await registerWpExtensions({
      cli,
      cwd: '/repo',
      hostVersion: '0.1.0',
      baseCommands: ['project'],
    })

    expect(result.commandNames).toEqual(['check'])
    expect(command).toHaveBeenCalledTimes(1)
    expect(result.warnings).toEqual([
      'ext-a: skipped command "project" because it collides with an existing command',
      'ext-b: skipped command "project" because it collides with an existing command',
    ])
  })
})

describe('resolveWpCommandAlias', () => {
  it('rewrites extension aliases to their registered command names', () => {
    expect(
      resolveWpCommandAlias('dev', new Map([['dev', { name: 'dev', commandName: 'project' }]])),
    ).toBe('project')
  })

  it('leaves base commands unchanged', () => {
    expect(resolveWpCommandAlias('setup', new Map())).toBe('setup')
  })
})
