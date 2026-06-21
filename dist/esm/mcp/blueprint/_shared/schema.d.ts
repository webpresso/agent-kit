export declare const nextActionOutputSchema: {
    readonly type: "object";
    readonly properties: {
        readonly kind: {
            readonly type: "string";
        };
        readonly hint: {
            readonly type: "string";
        };
    };
    readonly required: readonly ["kind", "hint"];
};
export declare const summaryEnvelopeOutputSchema: {
    readonly type: "object";
    readonly properties: {
        readonly summary: {
            readonly type: "string";
        };
        readonly failures: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
            };
        };
        readonly bytes: {
            readonly type: "number";
        };
        readonly tokensSaved: {
            readonly type: "number";
        };
    };
    readonly required: readonly ["summary", "failures", "bytes", "tokensSaved"];
};
//# sourceMappingURL=schema.d.ts.map