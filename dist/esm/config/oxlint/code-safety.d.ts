declare const plugin: {
    meta: {
        name: string;
    };
    rules: {
        "as-any-audit": {
            create(context: any): {
                TSAsExpression(node: any): void;
            };
        };
        "no-swallowed-errors": {
            create(context: any): {
                CatchClause(node: any): void;
            };
        };
    };
};
export default plugin;
//# sourceMappingURL=code-safety.d.ts.map