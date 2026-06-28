import { existsSync } from "node:fs";
import path from "node:path";

import type { CAC } from "cac";
import { addAffectedOptions, resolveAffectedTargets } from "#git/affected";
import type { AffectedResolutionDeps, AffectedScope } from "#git/affected";
import { resolveProjectRoot } from "#mcp/tools/_shared/project-root.js";
import { getManagedRunner } from "#tool-runtime";
import { getPackageScript, isRecursiveWpScript } from "#cli/package-scripts.js";
import {
  emitCliCommandOutput,
  runCliCommandSequence,
  type CliSpawnCommand,
} from "./quality-runner.js";
import { filterActiveTypecheckFiles, runAffectedTypecheck } from "#typecheck/affected.js";
import { planTypecheckExecution } from "#typecheck/planner.js";

export const TYPECHECK_COMMAND_HELP = [
  "Typecheck the current workspace through the portable wp surface.",
  "",
  "Use --file to resolve source files to their owning scope and run the normal",
  "scope typecheck once per resolved scope. This is not isolated-file `tsc`.",
  "",
  "Examples:",
  "  wp typecheck",
  "  wp typecheck --file src/index.ts",
  "  wp typecheck --package @webpresso/agent-kit",
  "  wp typecheck --affected              # staged changed source → reverse-importer closure",
  "  wp typecheck --affected --branch     # changed vs origin/${GITHUB_BASE_REF:-main}",
  "  wp typecheck --pretty",
].join("\n");

export interface TypecheckOptions {
  readonly pretty?: boolean;
  readonly cwd?: string;
  readonly files?: readonly string[];
  readonly packages?: readonly string[];
}

interface TypecheckCommandDeps {
  readonly getGitTopLevel?: AffectedResolutionDeps["getGitTopLevel"];
  readonly getStagedFiles?: AffectedResolutionDeps["getStagedFiles"];
  readonly getBranchChangedFiles?: AffectedResolutionDeps["getBranchChangedFiles"];
}

export interface TypecheckCommandConfig {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Record<string, string>;
}

export function registerTypecheckCommand(cli: CAC, deps: TypecheckCommandDeps = {}): void {
  addAffectedOptions(
    cli
      .command("typecheck", TYPECHECK_COMMAND_HELP)
      .option("--file <path>", "Resolve a source file to its owning typecheck scope (repeatable)")
      .option(
        "--package <name>",
        "Run the owning-scope typecheck for an exact package.json name (repeatable)",
      ),
  )
    .option("--pretty", "Keep TypeScript pretty output enabled")
    .option("--full", "Print the full raw output instead of the default summary-first view")
    .action(async (flags: Record<string, unknown>) => {
      const explicitFiles = toArray(flags.file as string | string[] | undefined);
      const packages = toArray(flags.package as string | string[] | undefined);
      const affected = Boolean(flags.affected);
      const branch = Boolean(flags.branch);
      const cwd = process.cwd();
      let files = explicitFiles;
      let executionCwd = cwd;

      if (affected || branch) {
        const resolution = resolveAffectedTargets(
          {
            commandName: "typecheck",
            cwd,
            affected,
            branch,
            explicitTargets: [...explicitFiles, ...packages],
            explicitTargetFlags: "--file or --package",
            policy: "fallback-full",
            mapChangedFiles: filterActiveTypecheckableFiles,
            emptyMessage: typecheckEmptyMessage,
            degradedFallbackMessage: (reason) =>
              `Unable to determine affected files for typecheck (${reason}); falling back to the full typecheck surface.`,
            degradedFailClosedMessage: (reason) =>
              `Unable to determine affected files for typecheck (${reason}); refusing degraded affected execution.`,
          },
          deps,
        );
        if (resolution.kind === "invalid") {
          console.error(resolution.message);
          return 1;
        }
        executionCwd = resolution.cwd;
        if (resolution.kind === "degraded-fallback") {
          console.error(resolution.message);
          files = [];
        }
        if (resolution.kind === "empty") {
          console.log(resolution.message);
          return 0;
        }
        if (resolution.kind === "scoped") {
          const result = await runAffectedTypecheck({
            repoRoot: resolution.cwd,
            files: resolution.targets,
            pretty: Boolean(flags.pretty),
          });
          emitCliCommandOutput({
            entry: result.entry,
            summary: result.entry.summary ?? "",
            passed: result.exitCode === 0,
            full: Boolean(flags.full),
            toolName: "wp_typecheck",
          });
          return result.exitCode;
        }
      }

      const result = await runTypecheckCommand({
        pretty: Boolean(flags.pretty),
        files,
        packages,
        cwd: executionCwd,
      });
      emitCliCommandOutput({
        entry: result.entry,
        summary: result.entry.summary ?? "",
        passed: result.exitCode === 0,
        full: Boolean(flags.full),
        toolName: "wp_typecheck",
      });
      return result.exitCode;
    });
}

export function buildTypecheckCommand(options: TypecheckOptions = {}): TypecheckCommandConfig {
  const cwd = options.cwd ?? process.cwd();
  const checkTypesScript = getPackageScript(cwd, "check-types");
  if (checkTypesScript && !isRecursiveWpScript(checkTypesScript, "typecheck")) {
    const resolution = getManagedRunner("vp");
    return {
      command: resolution.command,
      args: [...resolution.args, "run", "check-types"],
    };
  }

  const resolution = getManagedRunner("tsc");
  return {
    command: resolution.command,
    args: [...resolution.args, "--noEmit", ...(options.pretty ? [] : ["--pretty", "false"])],
  };
}

export async function runTypecheckCommand(
  options: TypecheckOptions = {},
): Promise<{ exitCode: number; entry: import("./quality-log-store.js").CliLogEntry }> {
  if (
    options.files &&
    options.files.length > 0 &&
    options.packages &&
    options.packages.length > 0
  ) {
    throw new Error("Cannot use both --file and --package for typecheck targeting.");
  }

  const cwd = options.cwd ?? process.cwd();
  const targeted = (options.files?.length ?? 0) > 0 || (options.packages?.length ?? 0) > 0;
  const repoRoot = resolveProjectRoot({ cwd });
  const plan = targeted
    ? planTypecheckExecution({
        repoRoot,
        defaultScopeRoot: cwd,
        files: options.files,
        packages: options.packages,
        pretty: options.pretty,
      })
    : {
        commands: [buildTypecheckCommand(options)],
        preambleLine: undefined,
        resolvedScopes: [],
      };

  const commands: CliSpawnCommand[] = plan.commands.map((command) => ({
    command: command.command,
    args: command.args,
    env: command.env,
    cwd: "cwd" in command ? command.cwd : cwd,
  }));
  const result = await runCliCommandSequence({
    commandName: "typecheck",
    commands,
    cwd,
    preambleLines: plan.preambleLine ? [plan.preambleLine] : undefined,
    metadataOptions: {
      pretty: Boolean(options.pretty),
      files: options.files && options.files.length > 0 ? [...options.files] : undefined,
      packages: options.packages && options.packages.length > 0 ? [...options.packages] : undefined,
      resolvedScopes:
        plan.resolvedScopes.length > 0 ? plan.resolvedScopes.map((scope) => scope.name) : undefined,
    },
    summary: ({ exitCode, timedOut, aborted }) => {
      if (timedOut) return "typecheck timed out";
      if (aborted) return "typecheck aborted";
      return exitCode === 0 ? "typecheck passed" : `typecheck failed (exit ${exitCode})`;
    },
  });
  return { exitCode: result.exitCode, entry: result.entry };
}

function toArray(value: readonly string[] | string | undefined): string[] {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : [...value];
}

const TYPECHECK_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

function filterTypecheckableFiles(files: readonly string[], cwd: string): string[] {
  return files.filter((file) => {
    const extension = path.extname(file).toLowerCase();
    return TYPECHECK_EXTENSIONS.has(extension) && existsSync(path.join(cwd, file));
  });
}

function filterActiveTypecheckableFiles(files: readonly string[], cwd: string): string[] {
  return filterActiveTypecheckFiles({
    repoRoot: cwd,
    files: filterTypecheckableFiles(files, cwd),
  });
}

function typecheckEmptyMessage(scope: AffectedScope): string {
  return scope === "branch"
    ? "No affected typecheckable files changed vs base ref — skipping typecheck."
    : "No staged affected typecheckable files — skipping typecheck.";
}
