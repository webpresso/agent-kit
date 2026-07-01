declare const plugin: {
    meta: {
        name: string;
    };
    rules: {
        "no-adhoc-useQuery": {
            create(context: any): {
                CallExpression?: undefined;
            } | {
                CallExpression(node: any): void;
            };
        };
        "no-isLoading-on-queries": {
            create(context: any): {
                VariableDeclarator?: undefined;
                MemberExpression?: undefined;
            } | {
                VariableDeclarator(node: any): void;
                MemberExpression(node: any): void;
            };
        };
    };
};
export default plugin;
//# sourceMappingURL=query-patterns.d.ts.map