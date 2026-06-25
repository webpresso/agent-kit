/**
 * `@webpresso/source` resolve-condition helpers for vitest.
 *
 * Webpresso packages publish a `@webpresso/source` export condition that points
 * at raw TypeScript source. Tests must opt into that condition so they exercise
 * source rather than built `dist/`. This module is the single canonical
 * definition consumers merge into their vitest config — keep it free of any
 * consumer-specific aliases.
 *
 * Usage:
 * ```ts
 * import { nodeConfig } from '@webpresso/agent-config/vitest/node'
 * import { createWebpressoSourceResolveConfig } from '@webpresso/agent-config/vitest/source-conditions'
 * import { mergeConfig } from 'vite-plus/test/config'
 *
 * export default mergeConfig(nodeConfig, createWebpressoSourceResolveConfig({ tsconfigPaths: true }))
 * ```
 */

export type WebpressoSourceAlias =
  | { find: string | RegExp; replacement: string }
  | Record<string, string>;

export const webpressoSourceCondition = "@webpresso/source" as const;

/**
 * Vite client environments use top-level resolve conditions. Keep this list
 * deliberately narrow: Vite still applies the built-in import/default matches
 * for matching module types.
 */
export const webpressoSourceResolveConditions = [webpressoSourceCondition] as const;

/**
 * Vitest's default node environment runs through Vite's SSR resolver. Official
 * Vitest guidance requires custom package export/import conditions here rather
 * than only under top-level resolve.conditions.
 */
export const webpressoSourceSsrResolveConditions = [
  webpressoSourceCondition,
  "module",
  "node",
  "development|production",
] as const;

export interface WebpressoSourceResolveOptions {
  alias?: WebpressoSourceAlias[] | Record<string, string>;
  dedupe?: string[];
  tsconfigPaths?: boolean;
}

export interface WebpressoSourceResolveConfig {
  resolve: {
    conditions: string[];
    tsconfigPaths?: boolean;
    alias?: WebpressoSourceAlias[] | Record<string, string>;
    dedupe?: string[];
  };
  ssr: {
    resolve: {
      conditions: string[];
    };
  };
}

export function createWebpressoSourceResolveConfig(
  options: WebpressoSourceResolveOptions = {},
): WebpressoSourceResolveConfig {
  return {
    resolve: {
      conditions: [...webpressoSourceResolveConditions],
      ...(options.tsconfigPaths === undefined ? {} : { tsconfigPaths: options.tsconfigPaths }),
      ...(options.alias ? { alias: options.alias } : {}),
      ...(options.dedupe ? { dedupe: options.dedupe } : {}),
    },
    ssr: {
      resolve: {
        conditions: [...webpressoSourceSsrResolveConditions],
      },
    },
  };
}
