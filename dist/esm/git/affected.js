import { getBranchChangedFiles, getGitTopLevel, getStagedFiles, } from "#git/changed-files";
export function addAffectedOptions(command) {
    return command
        .option("--affected", "Scope to git-changed targets only (staged files by default)")
        .option("--branch", "With --affected, scope to files changed vs origin/${GITHUB_BASE_REF:-main}");
}
export function resolveAffectedTargets(request, deps = {}) {
    const cwd = request.cwd ?? process.cwd();
    const repoRoot = request.affected ? ((deps.getGitTopLevel ?? getGitTopLevel)(cwd) ?? cwd) : cwd;
    const validationError = validateAffectedRequest(request);
    if (validationError)
        return { kind: "invalid", message: validationError };
    if (!request.affected)
        return { kind: "disabled", cwd };
    const scope = request.branch ? "branch" : "staged";
    const selection = request.branch
        ? (deps.getBranchChangedFiles ?? getBranchChangedFiles)(cwd, request.baseRef)
        : (deps.getStagedFiles ?? getStagedFiles)(cwd);
    if (selection.degraded) {
        return request.policy === "fail-closed"
            ? {
                kind: "degraded-fail-closed",
                cwd: repoRoot,
                scope,
                reason: selection.reason,
                message: request.degradedFailClosedMessage(selection.reason),
            }
            : {
                kind: "degraded-fallback",
                cwd: repoRoot,
                scope,
                reason: selection.reason,
                message: request.degradedFallbackMessage(selection.reason),
            };
    }
    const targets = request.mapChangedFiles(selection.files, repoRoot);
    if (targets.length === 0) {
        return { kind: "empty", cwd: repoRoot, scope, message: request.emptyMessage(scope) };
    }
    return {
        kind: "scoped",
        cwd: repoRoot,
        scope,
        changedFiles: selection.files,
        targets,
    };
}
function validateAffectedRequest(request) {
    if (request.branch && !request.affected)
        return "--branch requires --affected";
    if (request.affected && (request.explicitTargets?.length ?? 0) > 0) {
        const targetFlags = request.explicitTargetFlags ?? "explicit targets";
        if (targetFlags.startsWith("--") && !targetFlags.includes(" or ")) {
            return `Cannot use --affected and ${targetFlags} together.`;
        }
        return `Cannot use --affected with ${targetFlags}.`;
    }
    return null;
}
//# sourceMappingURL=affected.js.map