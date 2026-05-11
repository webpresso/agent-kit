import type { UserWorkspaceConfig, ViteUserConfigExport } from 'vite-plus/test/config';
export interface CreateWebpressoNodeProjectsOptions {
    unitInclude?: string[];
    unitExclude?: string[];
    integrationInclude?: string[];
    maxWorkers?: number;
    fileParallelism?: boolean;
    isolate?: boolean;
    testTimeout?: number;
}
export declare function createWebpressoNodeProjects(name: string, options?: CreateWebpressoNodeProjectsOptions): UserWorkspaceConfig[];
export declare const webpressoNodeConfig: ViteUserConfigExport;
export default webpressoNodeConfig;
