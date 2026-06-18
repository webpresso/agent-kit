export function buildProvenance(entries, sourceFiles) {
    return {
        generatedAt: new Date().toISOString(),
        sourceFiles,
        sections: entries,
    };
}
//# sourceMappingURL=provenance.js.map