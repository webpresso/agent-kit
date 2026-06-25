import {
  getBranchChangedFiles,
  getGitTopLevel,
  getStagedFiles,
  type ChangedFilesResult,
  type ChangedFilesReason,
} from "#git/changed-files";

export interface AffectedCliFlags {
  readonly affected?: unknown;
  readonly branch?: unknown;
}

export type AffectedExecutionPolicy = "fallback-full" | "fail-closed";

export interface AffectedRequest<Target> {
  readonly commandName: string;
  readonly cwd?: string;
  readonly affected: boolean;
  readonly branch: boolean;
  readonly baseRef?: string;
  readonly explicitTargets?: readonly unknown[];
  readonly explicitTargetFlags?: string;
  readonly policy: AffectedExecutionPolicy;
  readonly mapChangedFiles: (files: readonly string[], repoRoot: string) => readonly Target[];
  readonly emptyMessage: (scope: AffectedScope) => string;
  readonly degradedFallbackMessage: (reason: ChangedFilesReason) => string;
  readonly degradedFailClosedMessage: (reason: ChangedFilesReason) => string;
}

export type AffectedScope = "staged" | "branch";

export type AffectedResolution<Target> =
  | { readonly kind: "disabled"; readonly cwd: string }
  | { readonly kind: "invalid"; readonly message: string }
  | {
      readonly kind: "scoped";
      readonly cwd: string;
      readonly scope: AffectedScope;
      readonly changedFiles: readonly string[];
      readonly targets: readonly Target[];
    }
  | {
      readonly kind: "empty";
      readonly cwd: string;
      readonly scope: AffectedScope;
      readonly message: string;
    }
  | {
      readonly kind: "degraded-fallback";
      readonly cwd: string;
      readonly scope: AffectedScope;
      readonly reason: ChangedFilesReason;
      readonly message: string;
    }
  | {
      readonly kind: "degraded-fail-closed";
      readonly cwd: string;
      readonly scope: AffectedScope;
      readonly reason: ChangedFilesReason;
      readonly message: string;
    };

export interface AffectedResolutionDeps {
  readonly getGitTopLevel?: (cwd: string) => string | null;
  readonly getStagedFiles?: (cwd: string) => ChangedFilesResult;
  readonly getBranchChangedFiles?: (cwd: string, baseRef?: string) => ChangedFilesResult;
}

export interface AffectedOptionRegistrar<TCommand> {
  option(name: string, description: string): TCommand;
}

export function addAffectedOptions<TCommand extends AffectedOptionRegistrar<TCommand>>(
  command: TCommand,
): TCommand {
  return command
    .option("--affected", "Scope to git-changed targets only (staged files by default)")
    .option(
      "--branch",
      "With --affected, scope to files changed vs origin/${GITHUB_BASE_REF:-main}",
    );
}

export function resolveAffectedTargets<Target>(
  request: AffectedRequest<Target>,
  deps: AffectedResolutionDeps = {},
): AffectedResolution<Target> {
  const cwd = request.cwd ?? process.cwd();
  const repoRoot = request.affected ? ((deps.getGitTopLevel ?? getGitTopLevel)(cwd) ?? cwd) : cwd;

  const validationError = validateAffectedRequest(request);
  if (validationError) return { kind: "invalid", message: validationError };
  if (!request.affected) return { kind: "disabled", cwd };

  const scope: AffectedScope = request.branch ? "branch" : "staged";
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

function validateAffectedRequest(request: AffectedRequest<unknown>): string | null {
  if (request.branch && !request.affected) return "--branch requires --affected";
  if (request.affected && (request.explicitTargets?.length ?? 0) > 0) {
    const targetFlags = request.explicitTargetFlags ?? "explicit targets";
    if (targetFlags.startsWith("--") && !targetFlags.includes(" or ")) {
      return `Cannot use --affected and ${targetFlags} together.`;
    }
    return `Cannot use --affected with ${targetFlags}.`;
  }
  return null;
}
