import type { ConfigEnv, Plugin, UserConfig } from 'vite'

import { describe, expect, it } from 'vitest'

import { dropConsolePlugin, dropConsolePluginTerser } from './vite-drop-console'

const buildEnv: ConfigEnv = {
  command: 'build',
  mode: 'production',
  isSsrBuild: false,
  isPreview: false,
}

function runConfigHook(plugin: Plugin, config: UserConfig = {}): UserConfig | undefined {
  const configHook = plugin.config

  if (typeof configHook !== 'function') {
    throw new TypeError('Expected plugin config hook to be a function')
  }

  const result = (
    configHook as (
      this: unknown,
      config: UserConfig,
      env: ConfigEnv,
    ) => UserConfig | Promise<UserConfig | null | void> | null | void
  ).call(undefined, config, buildEnv)

  if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
    throw new TypeError('Expected synchronous config hook result')
  }

  const syncResult = result as UserConfig | null | void

  return syncResult ?? undefined
}

function getTerserCompress(config: UserConfig | undefined): Record<string, unknown> | undefined {
  const terserOptions = config?.build?.terserOptions as
    | { compress?: Record<string, unknown> }
    | undefined
  return terserOptions?.compress
}

describe('dropConsolePlugin', () => {
  it('uses OXC minification and enables Rolldown dropConsole by default', () => {
    const result = runConfigHook(dropConsolePlugin({ enabled: true }), {
      build: {
        rolldownOptions: {
          output: {
            entryFileNames: '[name].js',
            minify: {
              mangle: false,
            },
          },
        },
      },
    })

    expect(result).toEqual({
      build: {
        minify: 'oxc',
        rolldownOptions: {
          output: {
            entryFileNames: '[name].js',
            minify: {
              mangle: false,
              compress: {
                dropConsole: true,
              },
            },
          },
        },
      },
    })
  })

  it('updates every Rolldown output when output is configured as an array', () => {
    const result = runConfigHook(dropConsolePlugin({ enabled: true }), {
      build: {
        rolldownOptions: {
          output: [
            {
              entryFileNames: '[name].js',
            },
            {
              entryFileNames: '[name]-legacy.js',
              minify: 'dce-only',
            },
          ],
        },
      },
    })

    expect(result?.build?.rolldownOptions?.output).toEqual([
      {
        entryFileNames: '[name].js',
        minify: {
          compress: {
            dropConsole: true,
          },
        },
      },
      {
        entryFileNames: '[name]-legacy.js',
        minify: {
          compress: {
            dropConsole: true,
          },
        },
      },
    ])
  })

  it('falls back to terser when specific console methods must be kept', () => {
    const result = runConfigHook(dropConsolePlugin({ enabled: true, exclude: ['error', 'warn'] }))

    expect(result).toEqual({
      build: {
        minify: 'terser',
        terserOptions: {
          compress: {
            drop_console: false,
            pure_funcs: expect.arrayContaining([
              'console.log',
              'console.debug',
              'console.info',
              'console.trace',
            ]),
          },
        },
      },
    })
    expect(getTerserCompress(result)).not.toMatchObject({
      pure_funcs: expect.arrayContaining(['console.error', 'console.warn']),
    })
  })
})

describe('dropConsolePluginTerser', () => {
  it('drops all console calls when no methods are kept', () => {
    const result = runConfigHook(dropConsolePluginTerser({ enabled: true }))

    expect(result).toEqual({
      build: {
        minify: 'terser',
        terserOptions: {
          compress: {
            drop_console: true,
            pure_funcs: undefined,
          },
        },
      },
    })
  })
})
