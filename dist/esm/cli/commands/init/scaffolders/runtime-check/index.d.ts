export interface RuntimeProbe {
    name: string;
    /** Returns the version string if found, null otherwise. */
    detect: () => string | null;
    /** Install hint shown when `detect()` returns null. */
    hint: string;
}
export interface RuntimeStatus {
    name: string;
    version: string | null;
    hint: string;
}
export declare const DEFAULT_PROBES: RuntimeProbe[];
export declare function checkRuntimes(probes?: RuntimeProbe[]): RuntimeStatus[];
//# sourceMappingURL=index.d.ts.map