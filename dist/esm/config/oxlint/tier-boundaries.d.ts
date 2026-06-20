export declare function resolveFileTierContext(filename: any): {
    kind: string;
    packageName: any;
    tier: number;
} | {
    kind: string;
} | null;
export declare function resolveImportTierContext(source: any): {
    kind: string;
    packageName: any;
    tier: number;
} | {
    kind: string;
} | null;
declare const plugin: {
    meta: {
        name: string;
    };
    rules: {
        'no-higher-tier-imports': {
            create(context: any): {
                ImportDeclaration?: undefined;
                ExportNamedDeclaration?: undefined;
                ExportAllDeclaration?: undefined;
                ImportExpression?: undefined;
            } | {
                ImportDeclaration(node: any): void;
                ExportNamedDeclaration(node: any): void;
                ExportAllDeclaration(node: any): void;
                ImportExpression(node: any): void;
            };
        };
    };
};
export default plugin;
//# sourceMappingURL=tier-boundaries.d.ts.map