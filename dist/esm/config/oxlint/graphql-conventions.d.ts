declare const plugin: {
    meta: {
        name: string;
    };
    rules: {
        "no-singular-graphql-fields": {
            create(context: any): {
                TemplateLiteral(node: any): void;
                Literal(node: any): void;
            };
        };
        "no-inline-graphql-in-app": {
            create(context: any): {
                TaggedTemplateExpression?: undefined;
                TemplateLiteral?: undefined;
            } | {
                TaggedTemplateExpression(node: any): void;
                TemplateLiteral(node: any): void;
            };
        };
    };
};
export default plugin;
//# sourceMappingURL=graphql-conventions.d.ts.map