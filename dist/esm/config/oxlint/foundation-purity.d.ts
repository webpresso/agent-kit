declare const plugin: {
    meta: {
        name: string;
    };
    rules: {
        'no-framework-imports': {
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
//# sourceMappingURL=foundation-purity.d.ts.map