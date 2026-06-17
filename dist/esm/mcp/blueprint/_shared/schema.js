export const nextActionOutputSchema = {
    type: 'object',
    properties: {
        kind: { type: 'string' },
        hint: { type: 'string' },
    },
    required: ['kind', 'hint'],
};
export const summaryEnvelopeOutputSchema = {
    type: 'object',
    properties: {
        summary: { type: 'string' },
        failures: { type: 'array', items: { type: 'string' } },
        bytes: { type: 'number' },
        tokensSaved: { type: 'number' },
    },
    required: ['summary', 'failures', 'bytes', 'tokensSaved'],
};
//# sourceMappingURL=schema.js.map