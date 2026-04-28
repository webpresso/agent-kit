export declare const WEBPRESSO_CONFIG_PATH = "webpresso/config.yaml";
export declare const WEBPRESSO_BLUEPRINTS_DIR = "webpresso/blueprints";
export declare const DEFAULT_BLUEPRINTS_DIR = "blueprints";
export declare function hasWebpressoProjectMarker(projectPath: string): boolean;
export declare function hasGenericProjectMarker(projectPath: string): boolean;
interface ResolveConsumerRootOptions {
    defaultDir: string;
    webpressoDir: string;
    projectPath?: string;
}
export declare function resolveConsumerRoot({ defaultDir, webpressoDir, projectPath, }: ResolveConsumerRootOptions): string;
export declare function resolveBlueprintRoot(projectPath?: string): string;
export {};
//# sourceMappingURL=blueprint-root.d.ts.map