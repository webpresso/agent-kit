/**
 * Check for embedded phases in plan overview files.
 */
/**
 * Check for embedded phases in _overview.md.
 */
export function validateEmbeddedPhases(markdown) {
    const phaseHeaders = markdown.match(/^###? Phase \d+/gm) || [];
    if (phaseHeaders.length > 0) {
        return {
            hasEmbedded: true,
            phases: phaseHeaders,
            warning: `Plan has ${phaseHeaders.length} embedded phase(s). Consider using separate phase-N-*.md files`,
        };
    }
    return { hasEmbedded: false, phases: [] };
}
//# sourceMappingURL=phases.js.map