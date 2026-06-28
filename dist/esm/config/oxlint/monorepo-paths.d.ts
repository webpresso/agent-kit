export declare function hardcodedRepoRootDepth(args: any): {
    depth: number;
    index: number;
} | null;
declare const plugin: {
    meta: {
        name: string;
    };
    rules: {
        "no-hardcoded-repo-root": {
            create(context: any): {
                CallExpression(node: any): void;
            };
        };
        "no-cross-package-paths": {
            create(context: any): {
                CallExpression(node: any): void;
            };
        };
    };
};
export default plugin;
//# sourceMappingURL=monorepo-paths.d.ts.map