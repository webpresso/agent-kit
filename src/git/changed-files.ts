import { execFileSync } from "node:child_process";

export type ChangedFilesReason =
  | "ok"
  | "empty"
  | "not-a-repo"
  | "git-error"
  | "missing-base-ref"
  | "git-unavailable";

export interface ChangedFilesResult {
  readonly files: string[];
  readonly degraded: boolean;
  readonly reason: ChangedFilesReason;
}

export function defaultBranchBaseRef(env: NodeJS.ProcessEnv = process.env): string {
  return `origin/${env.GITHUB_BASE_REF ?? "main"}`;
}

export function getGitTopLevel(cwd: string = process.cwd()): string | null {
  try {
    const output = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

export function getStagedFiles(cwd: string = process.cwd()): ChangedFilesResult {
  const repoProbe = probeGitRepo(cwd);
  if (repoProbe !== true) return repoProbe;

  return readChangedFiles(cwd, ["diff", "-z", "--cached", "--name-only", "--diff-filter=ACMR"]);
}

export function getBranchChangedFiles(
  cwd: string = process.cwd(),
  base: string = defaultBranchBaseRef(),
): ChangedFilesResult {
  const repoProbe = probeGitRepo(cwd);
  if (repoProbe !== true) return repoProbe;

  const refProbe = probeRefExists(cwd, base);
  if (refProbe !== true) return refProbe;

  return readChangedFiles(cwd, [
    "diff",
    "-z",
    "--name-only",
    "--diff-filter=ACMR",
    `${base}...HEAD`,
  ]);
}

function probeGitRepo(cwd: string): true | ChangedFilesResult {
  try {
    const output = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return output === "true" ? true : { files: [], degraded: true, reason: "not-a-repo" };
  } catch (error) {
    return {
      files: [],
      degraded: true,
      reason: isGitUnavailableError(error) ? "git-unavailable" : "not-a-repo",
    };
  }
}

function probeRefExists(cwd: string, ref: string): true | ChangedFilesResult {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
      cwd,
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch (error) {
    return {
      files: [],
      degraded: true,
      reason: isGitUnavailableError(error) ? "git-unavailable" : "missing-base-ref",
    };
  }
}

function readChangedFiles(cwd: string, args: readonly string[]): ChangedFilesResult {
  try {
    const raw = execFileSync("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const parsed = parseNullDelimitedPaths(raw);
    const files = excludeSubmodulePaths(cwd, parsed);
    return {
      files,
      degraded: false,
      reason: files.length === 0 ? "empty" : "ok",
    };
  } catch (error) {
    return {
      files: [],
      degraded: true,
      reason: isGitUnavailableError(error) ? "git-unavailable" : "git-error",
    };
  }
}

function parseNullDelimitedPaths(raw: Buffer): string[] {
  const values = raw
    .toString("utf8")
    .split("\0")
    .filter((value) => value.length > 0);
  return [...new Set(values)];
}

function excludeSubmodulePaths(cwd: string, files: readonly string[]): string[] {
  if (files.length === 0) return [];

  try {
    const submodulePaths = new Set<string>();
    for (const chunk of chunkFiles(files, 500)) {
      const output = execFileSync("git", ["ls-files", "--stage", "-z", "--", ...chunk], {
        cwd,
        stdio: ["ignore", "pipe", "ignore"],
      });
      collectSubmodulePaths(output, submodulePaths);
    }
    return files.filter((file) => !submodulePaths.has(file));
  } catch {
    return [...files];
  }
}

function collectSubmodulePaths(raw: Buffer, target: Set<string>): void {
  for (const record of raw.toString("utf8").split("\0")) {
    if (record.length === 0) continue;
    const tabIndex = record.indexOf("\t");
    if (tabIndex === -1) continue;
    const metadata = record.slice(0, tabIndex);
    const path = record.slice(tabIndex + 1);
    const [mode] = metadata.split(" ", 1);
    if (mode === "160000") target.add(path);
  }
}

function chunkFiles(files: readonly string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < files.length; index += size) {
    chunks.push(files.slice(index, index + size));
  }
  return chunks;
}

function isGitUnavailableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
