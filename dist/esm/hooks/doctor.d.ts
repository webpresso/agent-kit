/**
 * `ak hooks doctor` — post-install plugin health verification.
 *
 * Verifies the agent-kit plugin installation is healthy:
 * - all hook bins exist
 * - bins are executable (skip on win32)
 * - bins respond to empty stdin with exit 0 + JSON
 * - plugin.json exists and references only paths that exist
 * - MCP server starts and responds to tools/list (soft-fail)
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
export interface RunHooksDoctorOptions {
    skipMcp?: boolean;
}
export declare function runHooksDoctor(opts?: RunHooksDoctorOptions): Promise<DoctorResult>;
export declare function printHooksDoctor(opts?: RunHooksDoctorOptions): Promise<number>;
//# sourceMappingURL=doctor.d.ts.map