export declare const STATE_FILE_RELATIVE_PATH = ".webpresso/agent-kit-dev-link.json";
export interface DevLinkState {
    package: string;
    linkedFrom: string;
    linkedAt?: string;
    agentKitVersion?: string;
    note?: string;
}
/**
 * Read + validate the dev-link state file from a consumer's repo root.
 *
 * Returns `null` when:
 *   - the file is absent (CI / never linked) — silent no-op path
 *   - the file is malformed JSON — degrade gracefully, never crash callers
 *   - required fields (`package`, `linkedFrom`) are missing or wrong type
 *
 * Callers MUST treat `null` as "no dev-link active" and proceed silently.
 * Callers that need fail-loud semantics on degraded state (e.g. the postinstall
 * restore bin) should layer their own error handling on top.
 */
export declare function readDevLinkState(consumerCwd: string): DevLinkState | null;
//# sourceMappingURL=dev-link-state.d.ts.map