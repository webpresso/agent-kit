/**
 * Returns a warning string when the running wp version differs from the
 * repo-pinned @webpresso/agent-kit in pnpm-workspace.yaml catalog.
 * Returns null when aligned or no pin can be resolved.
 */
export declare function checkVersionSkew(runningVersion: string, cwd?: string): string | null;
//# sourceMappingURL=version-skew.d.ts.map