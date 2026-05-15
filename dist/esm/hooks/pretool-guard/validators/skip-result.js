export function createSkipResult(validator, skipReason = 'Bypass enabled via FORBIDDEN_COMMANDS_SKIP=1 — exceptional cases only; restore guardrails immediately after the bypass run') {
    return { validator, passed: true, skipped: true, skipReason };
}
//# sourceMappingURL=skip-result.js.map