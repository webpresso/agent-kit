/**
 * `wp hooks doctor` — post-install plugin health verification.
 *
 * Verifies the webpresso plugin installation is healthy:
 * - all hook bins exist
 * - bins are executable (skip on win32)
 * - bins respond to empty stdin with exit 0 + JSON
 * - plugin.json exists and references only paths that exist
 * - MCP server starts and responds to tools/list (soft-fail)
 * - installed host CLIs (Codex/OpenCode/Claude) can see the expected surfaces
 */
export interface DoctorCheck {
    name: string;
    ok: boolean;
    detail?: string;
}
export interface DoctorResult {
    ok: boolean;
    checks: DoctorCheck[];
}
type HostCheckMode = 'auto' | 'skip' | 'required';
export interface RunHooksDoctorOptions {
    skipMcp?: boolean;
    hosts?: HostCheckMode;
    hostNames?: Array<'codex' | 'opencode' | 'claude'>;
    /** Override the working directory used to detect RTK marker files. Defaults to process.cwd(). */
    cwd?: string;
}
export declare function runHooksDoctor(opts?: RunHooksDoctorOptions): Promise<DoctorResult>;
export declare function printHooksDoctor(opts?: RunHooksDoctorOptions): Promise<number>;
export {};
//# sourceMappingURL=doctor.d.ts.map