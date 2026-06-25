import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export function repoHashFromRoot(root: string): string {
  return createHash("sha256").update(root).digest("hex").slice(0, 16);
}

export function computeRepoHash(startDir: string = process.cwd()): string {
  let root: string;
  try {
    root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: startDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    root = startDir;
  }
  return repoHashFromRoot(root);
}

export function resolveSessionRepoHash(startDir?: string): string {
  return (
    process.env["WP_REPO_HASH"] ?? process.env["CLAUDE_REPO_HASH"] ?? computeRepoHash(startDir)
  );
}
