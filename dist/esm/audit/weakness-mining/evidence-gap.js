export function detectEvidenceGap(readResult) {
    if (readResult.records.length > 0)
        return null;
    if (readResult.warnings.length > 0) {
        return {
            kind: 'unreadable-or-unparsed-evidence',
            message: 'Pretool evidence files were found but no parseable records were available.',
            candidateFiles: readResult.candidateFiles,
            warnings: readResult.warnings,
        };
    }
    return {
        kind: 'no-pretool-evidence',
        message: 'No pretool hook evidence was found; weakness mining is a no-op for this checkout.',
        candidateFiles: readResult.candidateFiles,
        warnings: [],
    };
}
//# sourceMappingURL=evidence-gap.js.map