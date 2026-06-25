import { lstatSync, readFileSync, readlinkSync } from "node:fs";

export const rootContractMode = "js-selector-runtime-lane" as const;
export const expectedRootWpBinRelativePath = "bin/wp" as const;
export const rootWpSelectorSource =
  "#!/usr/bin/env node\n\nimport { runNamedBin } from './_run.js'\n\nrunNamedBin('wp')\n";

export type RootLauncherValidationCode =
  | "ok"
  | "missing"
  | "symlink"
  | "symlink-runtime-target"
  | "not-file"
  | "not-executable"
  | "invalid-selector";

export interface RootLauncherValidationResult {
  readonly ok: boolean;
  readonly code: RootLauncherValidationCode;
  readonly path: string;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function normalizeLauncherSource(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

function isExecutableMode(mode: number): boolean {
  return process.platform === "win32" || (mode & 0o111) !== 0;
}

function isRuntimeTargetSymlinkTarget(targetPath: string): boolean {
  return /(^|\/)(?:bin\/)?runtime\/[^/]+\/wp(?:\.exe)?$/u.test(normalizePath(targetPath));
}

function isJavaScriptSelector(source: unknown): boolean {
  const buffer =
    typeof source === "string"
      ? Buffer.from(source, "utf8")
      : Buffer.isBuffer(source)
        ? source
        : null;
  if (buffer === null) return false;
  if (buffer.includes(0)) return false;
  return normalizeLauncherSource(buffer.toString("utf8")) === rootWpSelectorSource;
}

export function validateRootLauncherContract(path: string): RootLauncherValidationResult {
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, code: "missing", path };
    }
    throw error;
  }

  if (stat.isSymbolicLink()) {
    let targetPath = "";
    try {
      targetPath = readlinkSync(path);
    } catch {
      return { ok: false, code: "symlink", path };
    }
    return {
      ok: false,
      code: isRuntimeTargetSymlinkTarget(targetPath) ? "symlink-runtime-target" : "symlink",
      path,
    };
  }

  if (!stat.isFile()) return { ok: false, code: "not-file", path };
  if (!isExecutableMode(stat.mode)) return { ok: false, code: "not-executable", path };

  let source: unknown;
  try {
    source = readFileSync(path);
  } catch {
    return { ok: false, code: "invalid-selector", path };
  }
  if (!isJavaScriptSelector(source)) {
    return { ok: false, code: "invalid-selector", path };
  }

  return { ok: true, code: "ok", path };
}

export function formatRootLauncherContractSuccess(subject = expectedRootWpBinRelativePath): string {
  return `${subject} satisfies the ${rootContractMode} root launcher contract`;
}

export function formatRootLauncherContractFailure(
  result: RootLauncherValidationResult,
  subject = expectedRootWpBinRelativePath,
): string {
  switch (result.code) {
    case "missing":
      return `${subject} missing`;
    case "symlink":
      return `${subject} must be a real file, not a symlink`;
    case "symlink-runtime-target":
      return `${subject} must not symlink to bin/runtime/<target>/wp`;
    case "not-file":
      return `${subject} must be a regular file`;
    case "not-executable":
      return `${subject} must be executable`;
    case "invalid-selector":
      return `${subject} must be the cross-platform JS selector with a Node shebang, not a native/runtime payload`;
    case "ok":
      return formatRootLauncherContractSuccess(subject);
  }
}
