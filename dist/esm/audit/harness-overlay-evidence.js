import { validateAgentOverlays } from "#symlinker/overlay-loader";
export function auditHarnessOverlayEvidence(rootDirectory = process.cwd()) {
    const result = validateAgentOverlays(rootDirectory);
    return {
        ok: result.ok,
        title: "Harness overlay evidence",
        checked: result.overlays.length,
        violations: result.violations,
    };
}
//# sourceMappingURL=harness-overlay-evidence.js.map