declare const plugin: {
    meta: {
        name: string;
    };
    rules: {
        'no-weak-assertions': {
            create(context: any): {
                CallExpression(node: any): void;
            };
        };
        'no-bare-spy-assertions': {
            create(context: any): {
                CallExpression(node: any): void;
            };
        };
        'no-internal-mocks': {
            create(context: any): {
                CallExpression(node: any): void;
            };
        };
        'no-real-timers-in-tests': {
            create(context: any): {
                NewExpression(node: any): void;
            };
        };
        'no-cold-dynamic-import': {
            create(context: any): {
                CallExpression(node: any): void;
                'CallExpression:exit'(node: any): void;
                ImportExpression(node: any): void;
            };
        };
    };
};
export default plugin;
//# sourceMappingURL=testing-quality.d.ts.map