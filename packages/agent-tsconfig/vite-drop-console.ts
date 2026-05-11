import type { Plugin, UserConfig } from 'vite'

type DropConsoleOptions = {
  enabled?: boolean
  exclude?: string[]
}

type DropConsoleTerserOptions = {
  enabled?: boolean
  keep?: string[]
}

type RolldownMinify =
  | {
      compress?: Record<string, unknown>
      [key: string]: unknown
    }
  | string
  | false
  | undefined

type RolldownOutputEntry = {
  minify?: RolldownMinify
  [key: string]: unknown
}

type RolldownOutput = RolldownOutputEntry | RolldownOutputEntry[] | undefined

type BuildWithRolldown = NonNullable<UserConfig['build']> & {
  rolldownOptions?: {
    output?: RolldownOutput
    [key: string]: unknown
  }
  terserOptions?: TerserOptionsWithCompress
}

type TerserOptionsWithCompress = {
  compress?: Record<string, unknown>
  [key: string]: unknown
}

const CONSOLE_METHODS = [
  'assert',
  'clear',
  'count',
  'countReset',
  'debug',
  'dir',
  'dirxml',
  'error',
  'group',
  'groupCollapsed',
  'groupEnd',
  'info',
  'log',
  'table',
  'time',
  'timeEnd',
  'timeLog',
  'trace',
  'warn',
] as const

function getDroppedConsoleCalls(keep: readonly string[]): string[] {
  const keepSet = new Set(keep)

  return CONSOLE_METHODS.filter((method) => !keepSet.has(method)).map(
    (method) => `console.${method}`,
  )
}

function mergeRolldownOutputMinify(
  output: RolldownOutput,
  minifyPatch: RolldownMinify,
): RolldownOutput {
  if (Array.isArray(output)) {
    return output.map((entry) => ({
      ...entry,
      minify: mergeRolldownMinify(entry.minify, minifyPatch),
    }))
  }

  return {
    ...output,
    minify: mergeRolldownMinify(output?.minify, minifyPatch),
  }
}

function mergeRolldownMinify(current: RolldownMinify, patch: RolldownMinify): RolldownMinify {
  if (
    typeof current === 'object' &&
    current !== null &&
    typeof patch === 'object' &&
    patch !== null
  ) {
    return {
      ...current,
      ...patch,
      compress: {
        ...(typeof current.compress === 'object' && current.compress !== null
          ? current.compress
          : {}),
        ...(typeof patch.compress === 'object' && patch.compress !== null ? patch.compress : {}),
      },
    }
  }

  return patch
}

function createRolldownDropConsoleConfig(config: UserConfig): UserConfig {
  const build = (config.build ?? {}) as BuildWithRolldown
  const rolldownOptions = build.rolldownOptions ?? {}

  return {
    build: {
      ...build,
      minify: build.minify === false ? 'oxc' : (build.minify ?? 'oxc'),
      rolldownOptions: {
        ...rolldownOptions,
        output: mergeRolldownOutputMinify(rolldownOptions.output, {
          compress: {
            dropConsole: true,
          },
        }),
      },
    },
  } as UserConfig
}

function createTerserDropConsoleConfig(config: UserConfig, keep: readonly string[]): UserConfig {
  const build = (config.build ?? {}) as BuildWithRolldown
  const terserOptions = build.terserOptions ?? {}
  const compress =
    typeof terserOptions.compress === 'object' && terserOptions.compress !== null
      ? terserOptions.compress
      : {}

  return {
    build: {
      ...build,
      minify: 'terser',
      terserOptions: {
        ...terserOptions,
        compress: {
          ...compress,
          drop_console: keep.length === 0,
          pure_funcs: keep.length > 0 ? getDroppedConsoleCalls(keep) : undefined,
        },
      } as unknown as NonNullable<UserConfig['build']>['terserOptions'],
    },
  }
}

/**
 * Vite plugin to strip console.* calls in production builds
 *
 * This plugin uses Vite 8's Rolldown/OXC minification pipeline to remove
 * console statements during production builds. When specific methods must be
 * preserved, it falls back to terser because OXC only supports dropping all
 * console calls at once.
 *
 * Usage in vite.config.ts:
 * ```ts
 * import { dropConsolePlugin } from '@webpresso/tooling-typescript/vite-drop-console'
 *
 * export default defineConfig({
 *   plugins: [dropConsolePlugin()],
 * })
 * ```
 *
 * @param options - Configuration options
 * @param options.enabled - Whether to enable console stripping (default: process.env.NODE_ENV === 'production')
 * @param options.exclude - Array of console methods to keep (e.g., ['error', 'warn'])
 * @returns Vite plugin
 */
export function dropConsolePlugin(options?: DropConsoleOptions): Plugin {
  const enabled = options?.enabled ?? process.env.NODE_ENV === 'production'
  const exclude = options?.exclude ?? []

  return {
    name: 'drop-console',
    apply: 'build', // Only apply during build, not dev
    config(config: UserConfig) {
      if (!enabled) return

      if (exclude.length > 0) {
        return createTerserDropConsoleConfig(config, exclude)
      }

      return createRolldownDropConsoleConfig(config)
    },
  }
}

/**
 * Alternative approach using Terser for more control
 *
 * This provides more granular control over which console methods to drop
 * and allows for custom logic based on file paths.
 *
 * Note: Requires adding 'terser' as a dependency
 *
 * Usage:
 * ```ts
 * import { dropConsolePluginTerser } from '@webpresso/tooling-typescript/vite-drop-console'
 *
 * export default defineConfig({
 *   plugins: [dropConsolePluginTerser({ keep: ['error'] })],
 * })
 * ```
 */
export function dropConsolePluginTerser(options?: DropConsoleTerserOptions): Plugin {
  const enabled = options?.enabled ?? process.env.NODE_ENV === 'production'
  const keep = options?.keep ?? []

  return {
    name: 'drop-console-terser',
    apply: 'build',
    config(config: UserConfig) {
      if (!enabled) return

      return createTerserDropConsoleConfig(config, keep)
    },
  }
}
