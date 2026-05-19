/**
 * Shared Vitest configuration for Node.js packages
 *
 * Usage in vitest.config.ts:
 * ```ts
 * import { nodeConfig } from '@webpresso/agent-vitest/node'
 * import { defineConfig, mergeConfig } from 'vite-plus/test/config'
 *
 * export default mergeConfig(nodeConfig, defineConfig({
 *   // Your overrides here
 * }))
 * ```
 */
import type { UserWorkspaceConfig, ViteUserConfigExport } from 'vite-plus/test/config';
export interface CreateNodeProjectsOptions {
    unitInclude?: string[];
    unitExclude?: string[];
    integrationInclude?: string[];
    maxWorkers?: number;
    fileParallelism?: boolean;
    isolate?: boolean;
    testTimeout?: number;
}
/**
 * Create vitest projects for unit/integration test split.
 *
 * Usage in vitest.config.ts:
 * ```ts
 * import { nodeConfig, createNodeProjects } from '@webpresso/agent-vitest/node'
 * import { mergeConfig } from 'vite-plus/test/config'
 *
 * export default mergeConfig(nodeConfig, {
 *   test: { projects: createNodeProjects('my-package') },
 * })
 * ```
 *
 * @param name - Package name used as vitest project name prefix (e.g. 'deploy' → 'deploy/unit', 'deploy/integration')
 * @param options - Optional overrides for unit/integration include patterns
 */
export declare function createNodeProjects(name: string, options?: CreateNodeProjectsOptions): UserWorkspaceConfig[];
export declare const nodeConfig: ViteUserConfigExport;
export default nodeConfig;
//# sourceMappingURL=node.d.ts.map