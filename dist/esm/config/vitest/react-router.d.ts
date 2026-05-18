/**
 * Shared Vitest configuration for React Router apps (pages)
 *
 * Usage in vitest.config.ts:
 * ```ts
 * import { reactRouterConfig } from '@webpresso/agent-vitest/react-router'
 * import { defineConfig, mergeConfig } from 'vite-plus/test/config'
 *
 * export default mergeConfig(reactRouterConfig, defineConfig({
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
export declare const reactRouterConfig: ViteUserConfigExport;
export default reactRouterConfig;
//# sourceMappingURL=react-router.d.ts.map