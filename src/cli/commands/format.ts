import { existsSync } from "node:fs";
import path from "node:path";

import type { CAC } from "cac";

import {
  getBranchChangedFiles,
  getGitTopLevel,
  getStagedFiles,
  type ChangedFilesResult,
} from "#git/changed-files";
import { getManagedRunner } from "#tool-runtime";
import { emitCliCommandOutput, runCliCommandSequence } from "./quality-runner.js";

export const FORMAT_COMMAND_HELP = [
  "Format the workspace via the portable wp surface. Writes in place by default.",
  "",
  "Examples:",
  "  wp format            # rewrite files in place",
  "  wp format --file src/index.ts",
  "  wp format --affected              # staged formatable files only",
  "  wp format --affected --branch     # changed vs origin/${GITHUB_BASE_REF:-main}",
  "  wp format --check    # exit 1 on any unformatted file (no writes)",
  "",
  "`--affected` only sees staged files. Run git add first, or use `--affected --branch`.",
].join("\n");

const OXFMT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".cjs",
  ".mjs",
  ".json",
  ".md",
  ".mdx",
  ".sh",
  ".tmpl",
  ".yaml",
  ".yml",
]);

interface FormatCommandDeps {
  readonly getGitTopLevel?: (cwd: string) => string | null;
  readonly getStagedFiles?: (cwd: string) => ChangedFilesResult;
  readonly getBranchChangedFiles?: (cwd: string) => ChangedFilesResult;
}

export function registerFormatCommand(cli: CAC, deps: FormatCommandDeps = {}): void {
  cli
    .command("format", FORMAT_COMMAND_HELP)
    .option("--file <path>", "Format a file or path target (repeatable)")
    .option("--affected", "Format git-changed targets only (staged files by default)")
    .option(
      "--branch",
      "With --affected, scope to files changed vs origin/${GITHUB_BASE_REF:-main}",
    )
    .option("--check", "Check formatting without writing changes; exit 1 on drift")
    .option("--full", "Print the full raw output instead of the default summary-first view")
    .action(async (flags: Record<string, unknown>) => {
      const files = toArray(flags.file as string | string[] | undefined);
      const affected = Boolean(flags.affected);
      const branch = Boolean(flags.branch);
      const check = Boolean(flags.check);
      const cwd = process.cwd();
      const resolveGitTopLevel = deps.getGitTopLevel ?? getGitTopLevel;
      const affectedCwd = affected ? (resolveGitTopLevel(cwd) ?? cwd) : cwd;

      if (branch && !affected) {
        console.error("--branch requires --affected");
        return 1;
      }

      if (affected && files.length > 0) {
        console.error("Cannot use --affected and --file together.");
        return 1;
      }

      let targetFiles = files.length > 0 ? files : undefined;

      if (affected) {
        const selection = branch
          ? (deps.getBranchChangedFiles ?? getBranchChangedFiles)(cwd)
          : (deps.getStagedFiles ?? getStagedFiles)(cwd);

        if (selection.degraded) {
          if (!check) {
            console.error(
              `Unable to determine affected files for format (${selection.reason}); refusing a degraded whole-repo write. Rerun without --affected, pass --check, or target files explicitly.`,
            );
            return 1;
          }

          console.error(
            `Unable to determine affected files for format --check (${selection.reason}); falling back to a whole-repo format check.`,
          );
          targetFiles = undefined;
        } else {
          const executionCwd = affectedCwd;
          const formatableFiles = filterFormatableFiles(selection.files, executionCwd);
          if (formatableFiles.length === 0) {
            console.log(
              branch
                ? "No affected formatable files changed vs base ref — skipping format."
                : "No staged affected formatable files — skipping format.",
            );
            return 0;
          }
          targetFiles = formatableFiles;
        }
      }

      const result = await runFormatSafely({
        files: targetFiles,
        check,
        cwd: affectedCwd,
        metadataOptions: {
          affected,
          branch: affected ? branch : undefined,
          check,
          files: targetFiles,
        },
      });

      if (!result.ok) {
        console.error(result.message);
        return 1;
      }

      emitCliCommandOutput({
        entry: result.value.entry,
        summary: result.value.entry.summary ?? "",
        passed: result.value.exitCode === 0,
        full: Boolean(flags.full),
        toolName: "wp_format",
      });
      return result.value.exitCode;
    });
}

type SafeResult<T> = { ok: true; value: T } | { ok: false; message: string };

async function runFormatSafely(options: {
  readonly files?: readonly string[];
  readonly check?: boolean;
  readonly cwd?: string;
  readonly metadataOptions?: Record<string, unknown>;
}): Promise<SafeResult<{ exitCode: number; entry: import("./quality-log-store.js").CliLogEntry }>> {
  try {
    const command = buildFormatCommand(options);
    const result = await runCliCommandSequence({
      commandName: "format",
      commands: [command],
      cwd: options.cwd,
      metadataOptions: options.metadataOptions ?? {
        check: Boolean(options.check),
        files: options.files,
      },
      summary: ({ exitCode, timedOut, aborted }) => {
        if (timedOut) return "format timed out";
        if (aborted) return "format aborted";
        if (exitCode === 0) return options.check ? "format check passed" : "format applied";
        return options.check
          ? `format check failed (exit ${exitCode}) — run \`wp format\` to apply fixes`
          : `format failed (exit ${exitCode})`;
      },
    });
    return { ok: true, value: { exitCode: result.exitCode, entry: result.entry } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export function buildFormatCommand(options: {
  readonly files?: readonly string[];
  readonly check?: boolean;
}): { command: string; args: readonly string[] } {
  const args: string[] = [options.check ? "--check" : "--write", "--ignore-path", ".gitignore"];
  if (options.files && options.files.length > 0) args.push(...options.files);
  const resolution = getManagedRunner("vp", { outputPolicy: "structured" });
  return {
    command: resolution.command,
    args: [...resolution.args, "fmt", ...args],
  };
}

function filterFormatableFiles(files: readonly string[], cwd: string): string[] {
  return files.filter((file) => {
    const extension = path.extname(file).toLowerCase();
    return OXFMT_EXTENSIONS.has(extension) && existsSync(path.join(cwd, file));
  });
}

function toArray(value: readonly string[] | string | undefined): string[] {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : [...value];
}
