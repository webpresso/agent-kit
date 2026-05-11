type EsbuildLikeInitialOptions = {
  drop?: string[]
  pure?: string[]
}

type EsbuildLikeBuild = {
  initialOptions: EsbuildLikeInitialOptions
}

type EsbuildLikePlugin = {
  name: string
  setup(build: EsbuildLikeBuild): void
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

/**
 * esbuild plugin to strip console.* calls in production builds for Cloudflare Workers
 *
 * This plugin is used with Wrangler's esbuild configuration to remove
 * all console statements during the build process.
 *
 * Usage in wrangler.toml:
 * ```toml
 * [build]
 * command = "pnpm run build"
 *
 * [build.upload]
 * format = "service-worker"
 * ```
 *
 * Usage in build script (package.json):
 * ```json
 * {
 *   "scripts": {
 *     "build": "node build.mjs"
 *   }
 * }
 * ```
 *
 * Usage in build.mjs:
 * ```js
 * import * as esbuild from 'esbuild'
 * import { dropConsolePlugin } from '@webpresso/tooling-typescript/wrangler-drop-console'
 *
 * await esbuild.build({
 *   entryPoints: ['src/index.ts'],
 *   bundle: true,
 *   outfile: 'dist/index.js',
 *   plugins: [dropConsolePlugin()],
 * })
 * ```
 *
 * @param options - Configuration options
 * @param options.enabled - Whether to enable console stripping (default: process.env.NODE_ENV === 'production')
 * @param options.exclude - Array of console methods to keep (e.g., ['error', 'warn'])
 * @returns esbuild plugin
 */
export function dropConsolePlugin(options?: {
  enabled?: boolean
  exclude?: string[]
}): EsbuildLikePlugin {
  const enabled = options?.enabled ?? process.env.NODE_ENV === 'production'
  const exclude = options?.exclude ?? []

  return {
    name: 'drop-console',
    setup(build) {
      if (!enabled) return

      if (exclude.length > 0) {
        build.initialOptions.pure = getDroppedConsoleCalls(exclude)
        return
      }

      build.initialOptions.drop = ['console']
    },
  }
}

/**
 * Simplified approach: just configure esbuild directly
 *
 * Instead of using a plugin, you can configure esbuild directly in your build script:
 *
 * ```js
 * await esbuild.build({
 *   entryPoints: ['src/index.ts'],
 *   bundle: true,
 *   outfile: 'dist/index.js',
 *   drop: ['console'], // Drop all console statements
 *   // OR, to keep console.error and console.warn:
 *   pure: ['console.log', 'console.debug', 'console.info'],
 * })
 * ```
 */
