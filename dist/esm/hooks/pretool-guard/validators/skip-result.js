export function createSkipResult(validator, skipReason = 'Bypass enabled') {
    return { validator, passed: true, skipped: true, skipReason };
}
//# sourceMappingURL=skip-result.js.map