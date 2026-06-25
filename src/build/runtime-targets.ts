export interface RuntimeTarget {
  readonly id: string;
  readonly bunTarget: string;
  readonly os: NodeJS.Platform;
  readonly cpu: NodeJS.Architecture;
  readonly packageName: string;
}

export const RUNTIME_BINARY_NAME = "wp";

export const RUNTIME_TARGETS: readonly RuntimeTarget[] = [
  {
    id: "darwin-arm64",
    bunTarget: "bun-darwin-arm64",
    os: "darwin",
    cpu: "arm64",
    packageName: "@webpresso/agent-kit-runtime-darwin-arm64",
  },
  {
    id: "darwin-x64",
    bunTarget: "bun-darwin-x64",
    os: "darwin",
    cpu: "x64",
    packageName: "@webpresso/agent-kit-runtime-darwin-x64",
  },
  {
    id: "linux-x64",
    bunTarget: "bun-linux-x64",
    os: "linux",
    cpu: "x64",
    packageName: "@webpresso/agent-kit-runtime-linux-x64",
  },
  {
    id: "linux-arm64",
    bunTarget: "bun-linux-arm64",
    os: "linux",
    cpu: "arm64",
    packageName: "@webpresso/agent-kit-runtime-linux-arm64",
  },
  {
    id: "windows-x64",
    bunTarget: "bun-windows-x64",
    os: "win32",
    cpu: "x64",
    packageName: "@webpresso/agent-kit-runtime-windows-x64",
  },
] as const;

export function runtimeBinaryFilename(target: RuntimeTarget): string {
  return target.os === "win32" ? `${RUNTIME_BINARY_NAME}.exe` : RUNTIME_BINARY_NAME;
}

export function runtimePackageDirName(packageName: string): string {
  return packageName.split("/").at(-1) ?? packageName;
}

export function resolveRuntimeTarget(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
): RuntimeTarget | undefined {
  return RUNTIME_TARGETS.find((target) => target.os === platform && target.cpu === arch);
}
