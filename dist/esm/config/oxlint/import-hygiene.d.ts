declare const plugin: {
    meta: {
        name: string;
    };
    rules: {
        'no-relative-parent-imports': {
            create(context: any): {
                ImportDeclaration(node: any): void;
                ExportNamedDeclaration(node: any): void;
                ExportAllDeclaration(node: any): void;
                ImportExpression(node: any): void;
            };
        };
        'no-src-path-imports': {
            create(context: any): {
                ImportDeclaration(node: any): void;
            };
        };
        'no-relative-mock-paths': {
            create(context: any): {
                CallExpression(node: any): void;
            };
        };
        'no-forbidden-package-imports': {
            create(context: any): {
                ImportDeclaration(node: any): void;
                ExportNamedDeclaration(node: any): void;
                ExportAllDeclaration(node: any): void;
                ImportExpression(node: any): void;
            };
        };
    };
};
export default plugin;
//# sourceMappingURL=import-hygiene.d.ts.map