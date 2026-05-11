/**
 * Shared Vitest configuration for React packages
 *
 * Usage in vitest.config.ts:
 * ```ts
 * import { reactConfig } from '@webpresso/vitest-config/react'
 * import { defineConfig, mergeConfig } from 'vite-plus/test/config'
 *
 * export default mergeConfig(reactConfig, defineConfig({
 *   test: {
 *     setupFiles: ['./test/setup.ts'],
 *     env: {
 *       VITE_PUBLIC_APP_URL: 'http://localhost:3001',
 *     },
 *   },
 * }))
 * ```
 */
import type { ViteUserConfigExport } from 'vite-plus/test/config';
export declare const reactConfig: ViteUserConfigExport;
export default reactConfig;
