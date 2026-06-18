import type { LoadedDeployAdapter } from './types.js';
export declare class DeployAdapterConfigError extends Error {
    constructor(message: string);
}
export declare function loadDeployAdapter(cwd?: string): Promise<LoadedDeployAdapter | null>;
//# sourceMappingURL=load-adapter.d.ts.map